import type { Metadata } from 'next';
import Link from 'next/link';
import './styles.css';
export const metadata: Metadata = {
  title: 'VetReady Africa',
  description: 'Evidence-based veterinary development and industry readiness.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/" className="brand">
            VetReady Africa
          </Link>
          <nav aria-label="Main">
            <Link href="/dashboard">My profile</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          Veterinary education → assessed industry readiness → employment
        </footer>
      </body>
    </html>
  );
}
