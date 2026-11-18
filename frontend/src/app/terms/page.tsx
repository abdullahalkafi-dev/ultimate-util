import { PageFrame } from '@/components/layout/PageFrame';

export const metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <PageFrame narrow>
      <h1 style={{ font: '700 28px var(--head)' }}>Terms</h1>
      <div className="stack muted" style={{ lineHeight: 1.7 }}>
        <p>These tools are provided as they are, without warranty. Check important results before relying on them, especially converted documents and encrypted data.</p>
        <p>If you lose both your vault passphrase and recovery key, encrypted notes and 2FA entries cannot be recovered.</p>
        <p className="faint">This is a draft for development. Final terms are required before launch.</p>
      </div>
    </PageFrame>
  );
}
