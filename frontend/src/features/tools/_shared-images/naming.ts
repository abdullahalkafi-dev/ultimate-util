export interface NameContext {
  name: string;
  w: number;
  h: number;
  n: number;
  preset?: string;
  scale?: string;
}

export const NAME_TOKENS = ['{name}', '{w}', '{h}', '{n}', '{preset}', '{scale}'] as const;
const KNOWN = ['name', 'w', 'h', 'n', 'preset', 'scale'];

 
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Replaces characters that are illegal in file names. Unicode, emoji and RTL text are kept. */
export function sanitizeFileName(name: string): string {
  return name.replace(ILLEGAL, '_').replace(/^\.+/, '').replace(/[. ]+$/, '').trim();
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Fills the tokens. Unknown tokens are reported by validatePattern and left as typed here. */
export function renderName(pattern: string, ctx: NameContext): string {
  const values: Record<string, string> = {
    name: ctx.name,
    w: String(ctx.w),
    h: String(ctx.h),
    n: String(ctx.n).padStart(3, '0'),
    preset: ctx.preset ?? '',
    scale: ctx.scale ?? '',
  };
  const out = pattern.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? (values[key] as string) : m));
  return sanitizeFileName(out);
}

export function validatePattern(pattern: string): string | null {
  if (!pattern.trim()) return 'The name pattern is empty.';
  const unknown = [...pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((k) => !KNOWN.includes(k));
  if (unknown.length) return `Unknown token {${unknown[0]}}. Use ${NAME_TOKENS.join(', ')}.`;
  if (!sanitizeFileName(pattern.replace(/\{\w+\}/g, 'x'))) return 'The pattern would produce a blank name.';
  return null;
}

/** Makes names unique, case-insensitively, by appending " (2)", " (3)"... before the extension. */
export function dedupeNames(paths: string[]): string[] {
  const seen = new Map<string, number>();
  return paths.map((p) => {
    const key = p.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return p;
    const dot = p.lastIndexOf('.');
    const slash = p.lastIndexOf('/');
    return dot > slash + 1 ? `${p.slice(0, dot)} (${count + 1})${p.slice(dot)}` : `${p} (${count + 1})`;
  });
}
