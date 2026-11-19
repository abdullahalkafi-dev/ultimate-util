import cronstrue from 'cronstrue';
import { DOW_NAMES, type Dialect, type FieldKey, type FieldSpec, type Parsed } from './parse';

/** Day-of-week numbers differ per dialect, so hand cronstrue names (MON, FRI#3) instead of digits. */
export function dowToNames(raw: string, dialect: Dialect): string {
  const quartzLike = dialect === 'quartz' || dialect === 'aws';
  return raw
    .toUpperCase()
    .split(',')
    .map((item) => {
      if (item === 'L') return 'SAT';
      return item.replace(/(?<![/#\d])\d+/g, (n) => DOW_NAMES[quartzLike ? Number(n) - 1 : Number(n) % 7] ?? n);
    })
    .join(',');
}

function rawOf(p: Parsed, key: FieldKey, fallback: string): string {
  const f: FieldSpec | undefined = p.fields.find((x) => x.key === key);
  return f ? f.raw : fallback;
}

/** Quartz-style 6/7 field string that cronstrue reads: second minute hour dom month dow [year]. */
export function toCronstrueInput(p: Parsed): string {
  const parts = [
    rawOf(p, 'second', '0'),
    rawOf(p, 'minute', '0'),
    rawOf(p, 'hour', '0'),
    rawOf(p, 'dom', '*'),
    rawOf(p, 'month', '*'),
    dowToNames(rawOf(p, 'dow', '*'), p.dialect),
  ];
  const year = p.fields.find((f) => f.key === 'year');
  if (year && !year.any) parts.push(year.raw);
  return parts.join(' ');
}

export function describe(p: Parsed): string {
  if (p.reboot) return 'At system startup';
  const text = cronstrue.toString(toCronstrueInput(p), { throwExceptionOnParseError: false, verbose: false });
  // cronstrue reports its own problems as text starting with "An error occured"; keep a neutral message instead.
  if (/error occured/i.test(text)) return 'Valid expression, but a plain-English summary is not available for it.';
  return text;
}

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const list = (nums: number[], map?: (n: number) => string, max = 12) => {
  const shown = nums.slice(0, max).map((n) => (map ? map(n) : String(n))).join(', ');
  return nums.length > max ? `${shown}, ... (${nums.length} values)` : shown;
};

/** What each field means after normalization, for the breakdown table. */
export function normalizedMeaning(f: FieldSpec): string {
  if (f.question) return 'no specific value';
  if (f.any) return 'every value';
  const parts: string[] = [];
  if (f.values.length) {
    if (f.key === 'month') parts.push(list(f.values, (n) => MONTH_FULL[n - 1]!));
    else if (f.key === 'dow') parts.push(list(f.values, (n) => DOW_FULL[n]!));
    else parts.push(list(f.values));
  }
  for (const s of f.specials) {
    if (s.kind === 'last') parts.push('last day of the month');
    else if (s.kind === 'lastMinus') parts.push(`${s.n} days before the last day`);
    else if (s.kind === 'lastWeekday') parts.push('last weekday of the month');
    else if (s.kind === 'nearestWeekday') parts.push(`weekday nearest day ${s.day} (stays inside the month)`);
    else if (s.kind === 'lastDow') parts.push(`last ${DOW_FULL[s.dow]} of the month`);
    else parts.push(`${DOW_FULL[s.dow]} number ${s.n} of the month`);
  }
  return parts.join('; ');
}
