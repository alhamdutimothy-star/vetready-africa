'use client';
import { useActionState, useEffect, useState } from 'react';
import { savePractical, practicalCommand } from './actions';
import { CANDIDATE_DECLARATION } from '@vetready/domain';
import type { PracticalSaveState } from '../../lib/practical';
export function PracticalDraft({
  id,
  revision,
  commandId,
  summary,
  task,
  targets,
  options,
}: {
  id: string;
  revision: number;
  commandId: string;
  summary: string;
  task: string;
  targets: { childVersionId: string; requestedFacet: string }[];
  options: { childVersionId: string; code: string; statement: string }[];
}) {
  const [text, setText] = useState(summary),
    [activity, setActivity] = useState(task),
    [selected, setSelected] = useState(
      targets.map((t, key) => ({ ...t, key })),
    );
  const [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState<PracticalSaveState, FormData>(
    async (previous, form) => {
      const result = await savePractical(previous, form);
      if (result.ok) setDirty(false);
      return result;
    },
    { ok: false, revision, commandId, message: '' },
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <>
      <form action={action} onChange={() => setDirty(true)}>
        <input type="hidden" name="id" value={id} />
        <label>
          Activity summary
          <textarea
            name="summary"
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={pending}
            maxLength={4000}
          />
        </label>
        <label>
          Task and your involvement
          <input
            name="task"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            readOnly={pending}
            maxLength={160}
          />
        </label>
        <fieldset>
          <legend>Competencies addressed (proposed definitions)</legend>
          {selected.map((t) => (
            <div key={t.key}>
              <label>
                Competency
                <select
                  name="child"
                  value={t.childVersionId}
                  disabled={pending}
                  onChange={(e) =>
                    setSelected((s) =>
                      s.map((x) =>
                        x.key === t.key
                          ? { ...x, childVersionId: e.target.value }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="">Select a competency</option>
                  {options.map((o) => (
                    <option key={o.childVersionId} value={o.childVersionId}>
                      {o.code}: {o.statement}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Requested evidence facet
                <select
                  name="facet"
                  value={t.requestedFacet}
                  disabled={pending}
                  onChange={(e) =>
                    setSelected((s) =>
                      s.map((x) =>
                        x.key === t.key
                          ? { ...x, requestedFacet: e.target.value }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="PRACTICALLY_VERIFIED">
                    Practical evidence
                  </option>
                  <option value="WORKPLACE_VERIFIED">Workplace evidence</option>
                  <option value="SIMULATION_VERIFIED">
                    Simulation evidence
                  </option>
                </select>
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setSelected((s) => s.filter((x) => x.key !== t.key));
                  setDirty(true);
                }}
              >
                Remove this mapping
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={pending || selected.length >= 50}
            onClick={() => {
              setSelected((s) => [
                ...s,
                {
                  key: Math.max(-1, ...s.map((x) => x.key)) + 1,
                  childVersionId: '',
                  requestedFacet: 'PRACTICALLY_VERIFIED',
                },
              ]);
              setDirty(true);
            }}
          >
            Add competency mapping
          </button>
        </fieldset>
        <button disabled={pending}>
          {pending ? 'Saving…' : 'Save partial draft'}
        </button>
        <p role="status">{state.message}</p>
        <p>
          Saved revision: {state.revision}. Submit only after saving all
          changes. {dirty ? 'Unsaved changes remain.' : ''}
        </p>
      </form>
      <form action={practicalCommand}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="role" value="owner" />
        <input type="hidden" name="command" value="submit" />
        <input type="hidden" name="revision" value={state.revision} />
        <label>
          <input
            name="declaration"
            type="checkbox"
            required
            disabled={pending || dirty}
          />
          {CANDIDATE_DECLARATION}
        </label>
        <button disabled={pending || dirty}>
          Declare and submit saved revision {state.revision}
        </button>
      </form>
    </>
  );
}
