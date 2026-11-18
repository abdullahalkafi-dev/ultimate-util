export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
}

const segmenter = (granularity: 'word' | 'grapheme' | 'sentence', locale?: string) =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(locale, { granularity }) : null;

/** Counts user-visible characters (emoji and combined marks count once). */
export function countGraphemes(text: string): number {
  const seg = segmenter('grapheme');
  if (!seg) return Array.from(text).length;
  let n = 0;
  for (const _ of seg.segment(text)) n++;
  return n;
}

export function countWords(text: string, locale?: string): number {
  const seg = segmenter('word', locale);
  if (!seg) return (text.match(/\S+/g) ?? []).length;
  let n = 0;
  for (const part of seg.segment(text)) if (part.isWordLike) n++;
  return n;
}

export function countSentences(text: string, locale?: string): number {
  if (!text.trim()) return 0;
  const seg = segmenter('sentence', locale);
  if (!seg) return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).length;
  let n = 0;
  for (const part of seg.segment(text)) if (part.segment.trim()) n++;
  return n;
}

export function analyze(text: string, locale?: string): TextStats {
  const normalized = text.replace(/\r\n?/g, '\n');
  const withoutSpaces = normalized.replace(/\s/gu, '');
  return {
    words: countWords(normalized, locale),
    characters: countGraphemes(normalized),
    charactersNoSpaces: countGraphemes(withoutSpaces),
    sentences: countSentences(normalized, locale),
    paragraphs: normalized.split(/\n\s*\n/).filter((p) => p.trim()).length,
    lines: normalized === '' ? 0 : normalized.split('\n').length,
  };
}

export const WPM = { reading: 238, speaking: 150 } as const;

/** "1 min 30 sec" style duration. Returns "0 sec" for no words. */
export function formatDuration(words: number, wordsPerMinute: number): string {
  if (words <= 0 || wordsPerMinute <= 0) return '0 sec';
  const totalSeconds = Math.round((words / wordsPerMinute) * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s} sec`;
  return s === 0 ? `${m} min` : `${m} min ${s} sec`;
}

const STOPWORDS = new Set(
  'a an and are as at be but by for from has have he her his i if in into is it its me my not of on or our she so that the their them then there they this to was we were what when which who will with you your'.split(
    ' ',
  ),
);

export interface Keyword {
  word: string;
  count: number;
  density: number;
}

/** Most frequent words, ignoring common English filler words. */
export function keywords(text: string, limit = 10, locale?: string): Keyword[] {
  const seg = segmenter('word', locale);
  if (!seg) return [];
  const counts = new Map<string, number>();
  let total = 0;
  for (const part of seg.segment(text)) {
    if (!part.isWordLike) continue;
    total++;
    const word = part.segment.toLowerCase();
    if (word.length < 2 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count, density: total ? (count / total) * 100 : 0 }));
}

export const LIMITS = [
  { id: 'x', label: 'Post on X (280)', max: 280 },
  { id: 'title', label: 'SEO title (60)', max: 60 },
  { id: 'meta', label: 'Meta description (160)', max: 160 },
  { id: 'sms', label: 'One SMS (160, or 70 with emoji)', max: 160 },
] as const;
