'use client';
import { useActionState, useEffect, useState } from 'react';
import type { PilotAttempt } from '../../lib/dairy-pilot';
import { categoryLabels } from '../../lib/dairy-pilot';
import { saveReasoning, submitDairy } from './actions';
function Stage({
  attempt,
  item,
  onDirty,
  onSaved,
}: {
  attempt: PilotAttempt;
  item: PilotAttempt['items'][number];
  onDirty: (id: string) => void;
  onSaved: (id: string) => void;
}) {
  const configuration = attempt.configuration.find(
    (c) => c.item_version_id === item.id,
  )!;
  const [state, action, pending] = useActionState(saveReasoning, {
    ok: false,
    message: '',
    revision: configuration.revision,
  });
  const [edited, setEdited] = useState(false);
  // Controlled values survive React action-form resets, including failed saves.
  const [values, setValues] = useState(item.response?.reasoning ?? {});
  useEffect(() => {
    if (state.ok) {
      setEdited(false);
      onSaved(item.id);
    }
  }, [state, onSaved, item.id]);
  const title =
    attempt.caseBlueprint?.steps.find((s) => s.itemVersionId === item.id)
      ?.title ?? item.child_code;
  if (attempt.status !== 'IN_PROGRESS')
    return (
      <section id={`stage-${item.id}`}>
        <h2>{title}</h2>
        <p>{item.prompt}</p>
        <p>Mapped proposed competency: {configuration.competency}</p>
        <dl>
          {Object.entries(item.response?.reasoning ?? {}).map(
            ([category, value]) => (
              <div key={category}>
                <dt>{categoryLabels[category] ?? category}</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{value}</dd>
              </div>
            ),
          )}
        </dl>
        <p>Submitted answer locked; original reasoning is preserved.</p>
      </section>
    );
  return (
    <section id={`stage-${item.id}`}>
      <h2>{title}</h2>
      <p>{item.prompt}</p>
      <p>Proposed competency: {configuration.competency}</p>
      <form
        action={action}
        onChange={() => {
          setEdited(true);
          onDirty(item.id);
        }}
      >
        <input type="hidden" name="attemptId" value={attempt.id} />
        <input type="hidden" name="itemId" value={item.id} />
        <fieldset disabled={attempt.status !== 'IN_PROGRESS' || pending}>
          <legend>Your reasoning — separate from case-supplied facts</legend>
          {configuration.response_categories.map((category) => (
            <label key={category}>
              {categoryLabels[category] ?? category}
              <textarea
                name={category}
                maxLength={2000}
                rows={5}
                value={values[category] ?? ''}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setValues((v) => ({ ...v, [category]: value }));
                }}
              />
            </label>
          ))}
          {attempt.status === 'IN_PROGRESS' && (
            <button>{pending ? 'Saving…' : 'Save this stage'}</button>
          )}
        </fieldset>
        <p role="status" aria-live="polite">
          {edited
            ? 'Unsaved changes. Keep this page open until saved.'
            : state.message ||
              (configuration.revision
                ? 'Saved response loaded.'
                : 'Not saved yet.')}
        </p>
        {!state.ok && state.message && <p role="alert">{state.message}</p>}
      </form>
    </section>
  );
}
export function DairyReasoning({ attempt }: { attempt: PilotAttempt }) {
  const [saved, setSaved] = useState(
    () => new Set(attempt.items.filter((i) => i.response).map((i) => i.id)),
  );
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [submission, submit, pending] = useActionState(submitDairy, {
    ok: false,
    message: '',
    revision: 0,
  });
  // No browser storage of clinical/candidate material. Warn before leaving unsaved work.
  useEffect(() => {
    if (!dirty.size) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const onSaved = useState(() => (id: string) => {
    setSaved((s) => new Set(s).add(id));
    setDirty((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  })[0];
  const onDirty = useState(
    () => (id: string) => setDirty((s) => new Set(s).add(id)),
  )[0];
  return (
    <>
      <p role="status">
        {saved.size}/{attempt.items.length} stages saved. {dirty.size} with
        unsaved changes.
      </p>
      <nav aria-label="Reasoning stages">
        <ol>
          {attempt.caseBlueprint?.steps.map((s) => (
            <li key={s.itemVersionId}>
              <a href={`#stage-${s.itemVersionId}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      <p>
        Save each stage and wait for its server confirmation. If the connection
        fails, your entered text stays on this page. Do not close the page until
        saved.
      </p>
      {attempt.items.map((item) => (
        <Stage
          key={item.id}
          attempt={attempt}
          item={item}
          onDirty={onDirty}
          onSaved={onSaved}
        />
      ))}
      {attempt.status === 'IN_PROGRESS' && (
        <form action={submit}>
          <input type="hidden" name="attemptId" value={attempt.id} />
          <label className="check">
            <input name="confirm" type="checkbox" required />
            All my responses are saved. I understand submitted answers will be
            locked.
          </label>
          <button
            disabled={
              pending || dirty.size > 0 || saved.size !== attempt.items.length
            }
          >
            Submit case for review
          </button>
          <p role="status">{submission.message}</p>
        </form>
      )}
    </>
  );
}
