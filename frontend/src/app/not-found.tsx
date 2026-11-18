import Link from 'next/link';
import { PageFrame } from '@/components/layout/PageFrame';

export default function NotFound() {
  return (
    <PageFrame narrow>
      <div className="empty">
        <div style={{ fontWeight: 700, color: 'var(--fg)', fontSize: 18 }}>Page not found</div>
        <p>That page does not exist. Try the search (Ctrl K) or go back to all tools.</p>
        <Link href="/" className="btn primary">All tools</Link>
      </div>
    </PageFrame>
  );
}
