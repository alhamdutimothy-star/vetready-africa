'use client';
import { useActionState, useEffect, useState } from 'react';
import type { StaffPilot } from '../../lib/dairy-pilot';
import { categoryLabels } from '../../lib/dairy-pilot';
import { savePilotReview } from './actions';
export function DairyReviewForm({ attempt }: { attempt: StaffPilot }) {
  const draft = attempt.reviewDraft;
  const [state, action, pending] = useActionState(savePilotReview, {
    ok: false,
    message: '',
    revision: draft?.revision ?? 0,
    finalized: false,
  });
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState(draft?.feedback ?? '');
  const [decision, setDecision] = useState<string>(
    draft?.decision ?? 'DEVELOPMENT_FEEDBACK',
  );
  const [judgments, setJudgments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (draft?.observations ?? []).map((o) => [
        o.rubricCriterionId,
        o.observation ?? '',
      ]),
    ),
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (draft?.observations ?? []).map((o) => [o.rubricCriterionId, o.comment]),
    ),
  );
  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const editable =
    attempt.canReview && attempt.status === 'SUBMITTED' && !state.finalized;
  return (
    <form action={action} onChange={() => setDirty(true)}>
      <input type="hidden" name="attemptId" value={attempt.id} />
      {!attempt.canReview && (
        <p>
          You may inspect this submission. Draft judgments require an active
          assigned assessor role.
        </p>
      )}
      <fieldset disabled={!editable || pending}>
        <legend>
          Qualitative rubric review — no pass mark or competence award
        </legend>
        {attempt.items.map((item) => (
          <article key={item.id}>
            <h3>
              {attempt.caseBlueprint?.steps.find(
                (s) => s.itemVersionId === item.id,
              )?.title ?? item.child_code}
            </h3>
            <p>{item.prompt}</p>
            <h4>Submitted candidate reasoning</h4>
            <dl>
              {Object.entries(item.response?.reasoning ?? {}).map(
                ([key, value]) => (
                  <div key={key}>
                    <dt>{categoryLabels[key] ?? key}</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{value}</dd>
                  </div>
                ),
              )}
            </dl>
            {item.rubric.map((criterion) => {
              const dimensions =
                attempt.caseBlueprint?.steps
                  .find((s) => s.itemVersionId === item.id)
                  ?.rubricDimensions?.filter(
                    (m) => m.rubricCriterionId === criterion.id,
                  )
                  .map((m) => m.dimension) ?? [];
              return (
                <fieldset key={criterion.id}>
                  <legend>{criterion.description}</legend>
                  <p>Rubric criterion reference: {criterion.id}</p>
                  <p>{dimensions.join(', ').replaceAll('_', ' ')}</p>
                  <details>
                    <summary>Private assessor guidance — proposed</summary>
                    <p>
                      {
                        attempt.privateGuidance.find(
                          (g) => g.rubric_criterion_id === criterion.id,
                        )?.assessor_guidance
                      }
                    </p>
                  </details>
                  <input
                    type="hidden"
                    name="criterionId"
                    value={criterion.id}
                  />
                  <label>
                    Judgment
                    <select
                      name={`judgment_${criterion.id}`}
                      value={judgments[criterion.id] ?? ''}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setJudgments((v) => ({ ...v, [criterion.id]: value }));
                      }}
                    >
                      <option value="">Not yet judged</option>
                      <option value="UNASSESSABLE">Unassessable</option>
                      <option value="NEEDS_DEVELOPMENT">
                        Needs development
                      </option>
                      <option value="DEMONSTRATED">
                        Demonstrated in this written response only
                      </option>
                    </select>
                  </label>
                  <label>
                    Criterion feedback
                    <textarea
                      name={`comment_${criterion.id}`}
                      maxLength={2000}
                      value={comments[criterion.id] ?? ''}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setComments((v) => ({ ...v, [criterion.id]: value }));
                      }}
                    />
                  </label>
                </fieldset>
              );
            })}
          </article>
        ))}
        <label>
          Development review decision
          <select
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.currentTarget.value)}
          >
            <option value="DEVELOPMENT_FEEDBACK">
              Development feedback recorded
            </option>
            <option value="MORE_EVIDENCE_REQUIRED">
              More evidence required
            </option>
          </select>
        </label>
        <label>
          Overall candidate feedback
          <textarea
            name="feedback"
            maxLength={6000}
            value={feedback}
            onChange={(e) => setFeedback(e.currentTarget.value)}
          />
        </label>
        <p>
          Save incomplete judgments privately and resume later. Finalization
          requires all criterion judgments/comments and overall feedback.
          Neither decision is certification or practical verification.
        </p>
        <button name="operation" value="save">
          {pending ? 'Saving…' : 'Save private review draft'}
        </button>{' '}
        <button name="operation" value="finalize">
          Finalize candidate feedback
        </button>
      </fieldset>
      <p role="status" aria-live="polite">
        {dirty
          ? 'Unsaved review changes. Keep this page open until saved.'
          : state.message ||
            (draft
              ? `Saved review draft revision ${draft.revision}.`
              : 'No saved review draft.')}
      </p>
      {!state.ok && state.message && <p role="alert">{state.message}</p>}
    </form>
  );
}
