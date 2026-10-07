'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section>
      <h1>We could not load this page</h1>
      <p>
        Please check your connection and retry. Your private records have not
        been shared.
      </p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
