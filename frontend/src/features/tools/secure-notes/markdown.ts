import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import { prepareMarkdown, secretTokenPattern } from './notes';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Images are never loaded (no network request on open); they become plain links. */
const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    image({ href, text }) {
      return `<a href="${escapeHtml(href)}">${escapeHtml(text || href)} (image not loaded)</a>`;
    },
  },
});

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    }
  });
}

/** Markdown to sanitized HTML. Secret blocks become buttons; revealed ones show their text (escaped). */
export function renderMarkdown(body: string, revealed: ReadonlySet<number>): string {
  const { md, secrets } = prepareMarkdown(body);
  const raw = marked.parse(md, { async: false }) as string;
  const withSecrets = raw.replace(secretTokenPattern, (_m, n: string) => {
    const i = Number(n);
    const text = secrets[i] ?? '';
    return revealed.has(i)
      ? `<button type="button" class="uu-secret revealed" data-secret="${i}" aria-label="Secret, revealed. Press Enter to hide">${escapeHtml(text)}</button>`
      : `<button type="button" class="uu-secret" data-secret="${i}" aria-label="Secret, hidden. Press Enter to reveal">••••••••</button>`;
  });
  if (!DOMPurify.isSupported) return escapeHtml(body); // no DOM: never return unsanitized HTML
  ensureHooks();
  return DOMPurify.sanitize(withSecrets, {
    FORBID_TAGS: ['img', 'style', 'iframe', 'form', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset'],
    ADD_ATTR: ['target', 'data-secret'],
  });
}
