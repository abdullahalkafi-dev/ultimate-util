import { PageFrame } from '@/components/layout/PageFrame';

export const metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <PageFrame narrow>
      <h1 style={{ font: '700 28px var(--head)' }}>Privacy</h1>
      <div className="stack muted" style={{ lineHeight: 1.7 }}>
        <p>
          <b>Tools that run in your browser</b> process your files and text on your device. They are not uploaded and they are not stored on our servers.
        </p>
        <p>
          <b>If you sign in with Google</b> we store your name, email address and profile picture, plus what you choose to save: bookmarks, snippets, palettes, clipboard items and focus history.
        </p>
        <p>
          <b>2FA codes and secure notes</b> are encrypted on your device with a passphrase only you know. We store only the encrypted result and cannot read it or recover your passphrase.
        </p>
        <p>
          You can export all of your data or delete your account from the Account page at any time. Deleting removes your data right away.
        </p>
        <p className="faint">This is a draft summary for development. Final privacy policy text is required before launch.</p>
      </div>
    </PageFrame>
  );
}
