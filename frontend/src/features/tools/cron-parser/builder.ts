/** Pure helpers behind the visual builder: field text <-> editable choice. */
import { DOW_NAMES, type Dialect, type FieldKey } from './parse';

export type Mode = 'every' | 'none' | 'values' | 'range' | 'step' | 'last' | 'lastMinus' | 'lastWeekday' | 'nearest' | 'nth' | 'lastDow' | 'custom';

export interface Choice {
  mode: Mode;
  values: string[];
  from: string;
  to: string;
  step: string;
  /** Day number for nearest weekday, or the offset for L-n. */
  day: string;
  dow: string;
  nth: string;
  custom: string;
}

export const emptyChoice = (): Choice => ({ mode: 'every', values: [], from: '', to: '', step: '5', day: '1', dow: '', nth: '1', custom: '' });

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Names to the dialect's numbers so checkboxes stay in sync with typed text. */
export function tokenToNumber(tok: string, key: FieldKey, dialect: Dialect): string {
  const t = tok.toUpperCase();
  if (key === 'month' && MONTHS.includes(t)) return String(MONTHS.indexOf(t) + 1);
  if (key === 'dow' && DOW_NAMES.includes(t)) {
    const i = DOW_NAMES.indexOf(t);
    return String(dialect === 'quartz' || dialect === 'aws' ? i + 1 : i);
  }
  return tok;
}

export function modesFor(key: FieldKey, dialect: Dialect): { id: Mode; label: string }[] {
  const base: { id: Mode; label: string }[] = [
    { id: 'every', label: 'Every' },
    { id: 'values', label: 'Specific values' },
    { id: 'range', label: 'Range' },
    { id: 'step', label: 'Step (every N)' },
  ];
  const quartzLike = dialect === 'quartz' || dialect === 'aws';
  if (quartzLike && (key === 'dom' || key === 'dow')) base.splice(1, 0, { id: 'none', label: 'No specific value (?)' });
  if (quartzLike && key === 'dom') base.push({ id: 'last', label: 'Last day' }, { id: 'lastMinus', label: 'N days before last day' }, { id: 'lastWeekday', label: 'Last weekday' }, { id: 'nearest', label: 'Nearest weekday to day' });
  if (quartzLike && key === 'dow') base.push({ id: 'nth', label: 'Nth weekday of month' }, { id: 'lastDow', label: 'Last weekday of month' });
  return base;
}

export function classifyField(raw: string, key: FieldKey, dialect: Dialect): Choice {
  const c = emptyChoice();
  const up = raw.toUpperCase();
  const num = (t: string) => tokenToNumber(t, key, dialect);
  let m: RegExpExecArray | null;
  if (up === '*') return c;
  if (up === '?') return { ...c, mode: 'none' };
  if (/^[A-Z0-9]+(,[A-Z0-9]+)*$/.test(up) && !(key === 'dom' && /^(L|LW)$/.test(up)) && !(key === 'dow' && up === 'L')) {
    return { ...c, mode: 'values', values: up.split(',').map(num) };
  }
  if ((m = /^([A-Z0-9]+)-([A-Z0-9]+)$/.exec(up))) return { ...c, mode: 'range', from: num(m[1]!), to: num(m[2]!) };
  if ((m = /^(\*|[A-Z0-9]+)\/(\d+)$/.exec(up))) return { ...c, mode: 'step', from: m[1] === '*' ? '' : num(m[1]!), step: m[2]! };
  if (key === 'dom') {
    if (up === 'L') return { ...c, mode: 'last' };
    if (up === 'LW') return { ...c, mode: 'lastWeekday' };
    if ((m = /^L-(\d+)$/.exec(up))) return { ...c, mode: 'lastMinus', day: m[1]! };
    if ((m = /^(\d+)W$/.exec(up))) return { ...c, mode: 'nearest', day: m[1]! };
  }
  if (key === 'dow') {
    if ((m = /^([A-Z0-9]+)#(\d)$/.exec(up))) return { ...c, mode: 'nth', dow: num(m[1]!), nth: m[2]! };
    if ((m = /^([A-Z0-9]+)L$/.exec(up))) return { ...c, mode: 'lastDow', dow: num(m[1]!) };
  }
  return { ...c, mode: 'custom', custom: raw };
}

export function buildField(c: Choice, fallbackMin: string): string {
  switch (c.mode) {
    case 'every':
      return '*';
    case 'none':
      return '?';
    case 'values':
      return c.values.length ? [...c.values].sort((a, b) => Number(a) - Number(b)).join(',') : fallbackMin;
    case 'range':
      return `${c.from || fallbackMin}-${c.to || c.from || fallbackMin}`;
    case 'step':
      return `${c.from ? c.from : '*'}/${c.step || '1'}`;
    case 'last':
      return 'L';
    case 'lastMinus':
      return `L-${c.day || '1'}`;
    case 'lastWeekday':
      return 'LW';
    case 'nearest':
      return `${c.day || '1'}W`;
    case 'nth':
      return `${c.dow || fallbackMin}#${c.nth || '1'}`;
    case 'lastDow':
      return `${c.dow || fallbackMin}L`;
    case 'custom':
      return c.custom || '*';
  }
}
