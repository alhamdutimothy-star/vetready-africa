'use client';
import { useActionState, useEffect, useState } from 'react';
import { saveLearningActivity } from './actions';
export function LearningActivity({
  enrollment,
  lesson,
  prompt,
  response,
  revision,
  commandId,
}: {
  enrollment: string;
  lesson: string;
  prompt: string;
  response: string;
  revision: number;
  commandId: string;
}) {
  const [text, setText] = useState(response),
    [savedText, setSavedText] = useState(response);
  const [state, action, pending] = useActionState(
    async (
      previous: import('../../../lib/dairy-learning').LearningSaveState,
      form: FormData,
    ) => {
      const result = await saveLearningActivity(previous, form);
      if (result.ok) setSavedText(String(form.get('response')));
      return result;
    },
    {
      ok: true,
      revision,
      commandId,
      message: revision
        ? 'Saved learning response available.'
        : 'No response saved yet.',
    },
  );
  const dirty = text !== savedText;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <form action={action}>
      <h3>Unscored learning activity</h3>
      <p>{prompt}</p>
      <input type="hidden" name="enrollment" value={enrollment} />
      <input type="hidden" name="lesson" value={lesson} />
      <label>
        My reasoning
        <textarea
          name="response"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={4000}
          rows={7}
          readOnly={pending}
        />
      </label>
      <button disabled={pending}>
        {pending ? 'Saving…' : 'Save activity response'}
      </button>
      <p role="status">
        {dirty ? 'Unsaved changes. Save before navigating away. ' : ''}
        {state.message}
      </p>
      <p>
        Activity revision: {state.revision}. Keep this page open if saving
        fails. Saving does not award knowledge, case or practical verification.
      </p>
    </form>
  );
}
