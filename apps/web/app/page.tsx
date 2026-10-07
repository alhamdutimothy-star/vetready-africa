import Link from 'next/link';
export default function Home() {
  return (
    <>
      <p className="eyebrow">Professional development · Nigeria</p>
      <h1>Build skills you can demonstrate.</h1>
      <p>
        Develop a professional profile and choose your career pathways.
        Competence will be based on assessed evidence, with human verification.
      </p>
      <section>
        <h2>Develop skills with traceable evidence</h2>
        <p>
          Private profiles, proposed career frameworks, demonstration
          assessments and individual development plans are available once
          managed sign-in is configured. Professional readiness and recruitment
          remain subject to later validation.
        </p>
        <Link className="button" href="/auth/login">
          Sign in securely
        </Link>
      </section>
      <section>
        <h2>Your profile starts private</h2>
        <p>
          Submitting experience or completing training does not verify practical
          competence. Employers do not receive your private records
          automatically.
        </p>
      </section>
    </>
  );
}
