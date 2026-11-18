import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="in foot">
      <span>Local tools never send your files to a server. Synced tools save to your account after Google login.</span>
      <span className="row" style={{ gap: 14 }}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <span>Ctrl K to search from anywhere</span>
      </span>
    </footer>
  );
}
