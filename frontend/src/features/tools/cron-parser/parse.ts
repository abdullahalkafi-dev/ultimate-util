/**
 * Own cron validation and model, because the libraries do not cover every dialect
 * (cron-parser has no `W`, Quartz numbering, years or EventBridge rules).
 */

export type Dialect = 'unix' | 'unix-seconds' | 'quartz' | 'aws' | 'k8s';
export type FieldKey = 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow' | 'year';

export const DIALECTS: { id: Dialect; label: string; fields: number; summary: string }[] = [
  { id: 'unix', label: 'Unix 5-field', fields: 5, summary: 'minute hour day-of-month month day-of-week' },
  { id: 'unix-seconds', label: '6-field (seconds)', fields: 6, summary: 'second minute hour day-of-month month day-of-week' },
  { id: 'quartz', label: 'Quartz', fields: 6, summary: 'second minute hour day-of-month month day-of-week [year]' },
  { id: 'aws', label: 'AWS EventBridge', fields: 6, summary: 'minute hour day-of-month month day-of-week year' },
  { id: 'k8s', label: 'Kubernetes CronJob', fields: 5, summary: 'minute hour day-of-month month day-of-week' },
];

const ORDER: Record<Dialect, FieldKey[]> = {
  unix: ['minute', 'hour', 'dom', 'month', 'dow'],
  k8s: ['minute', 'hour', 'dom', 'month', 'dow'],
  'unix-seconds': ['second', 'minute', 'hour', 'dom', 'month', 'dow'],
  quartz: ['second', 'minute', 'hour', 'dom', 'month', 'dow', 'year'],
  aws: ['minute', 'hour', 'dom', 'month', 'dow', 'year'],
};

export const fieldOrder = (d: Dialect, count?: number): FieldKey[] =>
  d === 'quartz' && count === 6 ? ORDER.quartz.slice(0, 6) : ORDER[d];

export const FIELD_LABEL: Record<FieldKey, string> = {
  second: 'Second',
  minute: 'Minute',
  hour: 'Hour',
  dom: 'Day-of-month',
  month: 'Month',
  dow: 'Day-of-week',
  year: 'Year',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export type Special =
  | { kind: 'last' } // L: last day of month
  | { kind: 'lastMinus'; n: number } // L-n
  | { kind: 'lastWeekday' } // LW
  | { kind: 'nearestWeekday'; day: number } // nW
  | { kind: 'lastDow'; dow: number } // nL (dow normalized 0-6)
  | { kind: 'nth'; dow: number; n: number }; // d#n

export interface FieldSpec {
  key: FieldKey;
  raw: string;
  /** Sorted, deduplicated. Day-of-week is normalized to 0 (Sunday) to 6. */
  values: number[];
  specials: Special[];
  /** Literally `*` or `?`. */
  any: boolean;
  /** Starts with `*` (Vixie rule). */
  star: boolean;
  question: boolean;
}

export interface Parsed {
  dialect: Dialect;
  keys: FieldKey[];
  fields: FieldSpec[];
  reboot: boolean;
  /** Fields as typed after macro expansion. */
  expanded: string;
  /** How day-of-month and day-of-week combine. */
  dayRule: 'dom' | 'dow' | 'and' | 'or' | 'any';
}

export type ParseResult =
  | { ok: true; parsed: Parsed; warnings: string[]; notes: string[] }
  | { ok: false; error: string; fieldIndex?: number; suggest?: Dialect };

class CronError extends Error {
  constructor(message: string, readonly fieldIndex?: number, readonly suggest?: Dialect) {
    super(message);
  }
}

interface Def {
  key: FieldKey;
  min: number;
  max: number;
  starMin: number;
  starMax: number;
  names?: Record<string, number>;
}

function defFor(key: FieldKey, d: Dialect): Def {
  const quartzLike = d === 'quartz' || d === 'aws';
  switch (key) {
    case 'second':
    case 'minute':
      return { key, min: 0, max: 59, starMin: 0, starMax: 59 };
    case 'hour':
      return { key, min: 0, max: 23, starMin: 0, starMax: 23 };
    case 'dom':
      return { key, min: 1, max: 31, starMin: 1, starMax: 31 };
    case 'month':
      return { key, min: 1, max: 12, starMin: 1, starMax: 12, names: Object.fromEntries(MONTHS.map((m, i) => [m, i + 1])) };
    case 'dow':
      return quartzLike
        ? { key, min: 1, max: 7, starMin: 1, starMax: 7, names: Object.fromEntries(DOW_NAMES.map((m, i) => [m, i + 1])) }
        : { key, min: 0, max: 7, starMin: 0, starMax: 6, names: Object.fromEntries(DOW_NAMES.map((m, i) => [m, i])) };
    case 'year':
      return { key, min: 1970, max: 2199, starMin: 1970, starMax: 2199 };
  }
}

const normDow = (v: number, d: Dialect) => (d === 'quartz' || d === 'aws' ? v - 1 : v % 7);

export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const DIALECT_NAME: Record<Dialect, string> = {
  unix: 'Unix',
  'unix-seconds': '6-field (seconds)',
  quartz: 'Quartz',
  aws: 'AWS EventBridge',
  k8s: 'Kubernetes',
};

function value(token: string, def: Def, d: Dialect, fieldIndex: number): number {
  const label = labelOf(def.key);
  let n: number;
  if (/^\d+$/.test(token)) n = Number(token);
  else if (def.names && def.names[token] !== undefined) n = def.names[token]!;
  else throw new CronError(`${label}: "${token}" is not a valid value${def.names ? ' (use a number or a name such as ' + Object.keys(def.names)[1] + ')' : ''}.`, fieldIndex);
  if (n < def.min || n > def.max) throw new CronError(`${label}: value ${n} is out of range ${def.min}-${def.max}.`, fieldIndex);
  void d;
  return n;
}

const labelOf = (k: FieldKey) => FIELD_LABEL[k];

function hasSpecials(d: Dialect) {
  return d === 'quartz' || d === 'aws';
}

function specialsError(token: string, key: FieldKey, fieldIndex: number): CronError {
  return new CronError(
    `${labelOf(key)}: "${token}" (L, W, #) is only supported by Quartz and AWS EventBridge, not by this dialect.`,
    fieldIndex,
    'quartz',
  );
}

interface ItemOut {
  values: number[];
  special?: Special;
  warnings: string[];
  any?: boolean;
}

function parseItem(token: string, def: Def, d: Dialect, fieldIndex: number): ItemOut {
  const warnings: string[] = [];
  const label = labelOf(def.key);
  if (token === '') throw new CronError(`${label}: empty value (check for doubled or trailing commas).`, fieldIndex);

  if (token === '?') {
    if (def.key !== 'dom' && def.key !== 'dow') throw new CronError(`${label}: "?" is only valid in day-of-month and day-of-week.`, fieldIndex);
    if (d === 'unix') throw new CronError(`${label}: "?" is not valid in Unix cron, use "*". (Quartz and EventBridge use it.)`, fieldIndex, 'quartz');
    return { values: range(def.starMin, def.starMax, 1), warnings, any: true };
  }

  if (/[LW#]/.test(token) && !/^\*/.test(token)) {
    if (def.key !== 'dom' && def.key !== 'dow') throw new CronError(`${label}: "${token}" is not a valid value.`, fieldIndex);
    if (!hasSpecials(d)) throw specialsError(token, def.key, fieldIndex);
    if (def.key === 'dom') {
      if (token === 'L') return { values: [], special: { kind: 'last' }, warnings };
      if (token === 'LW') return { values: [], special: { kind: 'lastWeekday' }, warnings };
      let m = /^L-(\d+)$/.exec(token);
      if (m) {
        const n = Number(m[1]);
        if (n < 1 || n > 30) throw new CronError(`${label}: offset in "${token}" must be 1-30.`, fieldIndex);
        return { values: [], special: { kind: 'lastMinus', n }, warnings };
      }
      m = /^(\d+)W$/.exec(token);
      if (m) {
        const day = Number(m[1]);
        if (day < 1 || day > 31) throw new CronError(`${label}: value ${day} is out of range 1-31.`, fieldIndex);
        return { values: [], special: { kind: 'nearestWeekday', day }, warnings };
      }
      throw new CronError(`${label}: "${token}" is not valid (expected L, L-n, LW or nW).`, fieldIndex);
    }
    // A bare L in day-of-week means the last day of the week: Saturday.
    if (token === 'L') return { values: [6], warnings };
    let m = /^([A-Z0-9]+)L$/.exec(token);
    if (m) return { values: [], special: { kind: 'lastDow', dow: normDow(value(m[1]!, def, d, fieldIndex), d) }, warnings };
    m = /^([A-Z0-9]+)#(\d+)$/.exec(token);
    if (m) {
      const n = Number(m[2]);
      if (n < 1 || n > 5) throw new CronError(`${label}: the occurrence in "${token}" must be 1-5.`, fieldIndex);
      return { values: [], special: { kind: 'nth', dow: normDow(value(m[1]!, def, d, fieldIndex), d), n }, warnings };
    }
    throw new CronError(`${label}: "${token}" is not valid (expected L, nL or n#m).`, fieldIndex);
  }

  const [base = '', stepStr, ...extra] = token.split('/');
  if (extra.length) throw new CronError(`${label}: "${token}" has more than one "/".`, fieldIndex);
  let lo: number;
  let hi: number;
  let wrapped = false;
  if (base === '*') {
    lo = def.starMin;
    hi = def.starMax;
  } else if (base.includes('-')) {
    const [a = '', b = '', ...more] = base.split('-');
    if (more.length || !a || !b) throw new CronError(`${label}: "${base}" is not a valid range.`, fieldIndex);
    lo = value(a, def, d, fieldIndex);
    hi = value(b, def, d, fieldIndex);
    if (lo > hi) {
      if (def.key === 'dow' && hasSpecials(d)) wrapped = true;
      else throw new CronError(`${label}: range ${base} is reversed (start ${lo} is greater than end ${hi}). ${def.key === 'dow' ? 'Only Quartz and EventBridge allow wrapping days such as FRI-MON.' : ''}`.trim(), fieldIndex);
    }
  } else {
    lo = value(base, def, d, fieldIndex);
    hi = stepStr !== undefined ? def.max : lo;
    if (stepStr !== undefined && def.key === 'dow') hi = def.starMax;
    if (stepStr !== undefined) warnings.push(`${label}: "${token}" means ${lo}-${hi} in steps of ${stepStr}.`);
  }
  let step = 1;
  if (stepStr !== undefined) {
    if (!/^\d+$/.test(stepStr)) throw new CronError(`${label}: step "${stepStr}" is not a number.`, fieldIndex);
    step = Number(stepStr);
    if (step === 0) throw new CronError(`${label}: step cannot be 0.`, fieldIndex);
    const span = def.starMax - def.starMin + 1;
    if (step > span) warnings.push(`${label}: step ${step} is larger than the field span (${span}); only the first value runs.`);
    else if (base === '*' && span % step !== 0 && def.key !== 'dom' && def.key !== 'dow' && def.key !== 'year') {
      warnings.push(`${label}: */${step} does not divide ${span} evenly, so the last gap is shorter (the step restarts at the field minimum).`);
    }
  }
  const vals: number[] = [];
  if (wrapped) {
    const span = def.max - def.min + 1;
    for (let v = lo; v <= hi + span; v += step) vals.push(((v - def.min) % span) + def.min);
  } else {
    for (let v = lo; v <= hi; v += step) vals.push(v);
  }
  return { values: vals.map((v) => (def.key === 'dow' ? normDow(v, d) : v)), warnings };
}

function range(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let v = a; v <= b; v += step) out.push(v);
  return out;
}

function parseField(raw: string, key: FieldKey, d: Dialect, fieldIndex: number, warnings: string[]): FieldSpec {
  const def = defFor(key, d);
  const upper = raw.toUpperCase();
  const values = new Set<number>();
  const specials: Special[] = [];
  const items = upper.split(',');
  let hasName = false;
  for (const item of items) {
    const out = parseItem(item, def, d, fieldIndex);
    out.values.forEach((v) => values.add(v));
    if (out.special) specials.push(out.special);
    warnings.push(...out.warnings);
    if (/[A-Z]{3}/.test(item) && !/[LW#]/.test(item.replace(/[A-Z]{3}/g, ''))) hasName = true;
  }
  if (hasName && d === 'unix' && (items.length > 1 || upper.includes('-'))) {
    warnings.push(`${labelOf(key)}: names in lists or ranges are rejected by the Vixie crontab(5) man page, though most schedulers (and this tool) accept them.`);
  }
  if (key === 'dow' && d === 'unix' && /(^|[^0-9])7/.test(upper)) {
    // 7 is Sunday just like 0; nothing to report, kept normalized.
  }
  return {
    key,
    raw,
    values: [...values].sort((a, b) => a - b),
    specials,
    any: raw === '*' || raw === '?',
    star: raw.startsWith('*') || raw === '?',
    question: raw === '?',
  };
}

export function suggestDialect(fieldCount: number, text: string): Dialect | undefined {
  if (fieldCount === 5) return 'unix';
  if (fieldCount === 7) return 'quartz';
  if (fieldCount === 6) return /\?/.test(text) ? 'quartz' : 'unix-seconds';
  return undefined;
}

export function checkCharacters(text: string): string | null {
  if (text.length > 200) return 'Expression is too long (limit 200 characters).';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) continue;
    const ch = text[i]!;
    const names: Record<string, string> = { '–': 'an en dash', '—': 'an em dash', '−': 'a minus sign', ' ': 'a non-breaking space' };
    return `Unexpected character "${ch}" at position ${i + 1}${names[ch] ? ` (${names[ch]}, probably from smart punctuation)` : ''}. Use plain ASCII.`;
  }
  return null;
}

/** Splits input into fields and removes `cron(...)` for AWS. Returns the cleaned field list. */
export function splitFields(input: string, dialect: Dialect): string[] {
  let t = input.trim();
  if (dialect === 'aws') {
    const m = /^cron\((.*)\)$/i.exec(t);
    if (m) t = m[1]!.trim();
  }
  return t.length ? t.split(/\s+/) : [];
}

export function parseCron(input: string, dialect: Dialect): ParseResult {
  const bad = checkCharacters(input);
  if (bad) return { ok: false, error: bad };
  const warnings: string[] = [];
  const notes: string[] = [];
  try {
    let parts = splitFields(input, dialect);
    if (parts.length === 0) return { ok: false, error: 'Enter a cron expression.' };

    let reboot = false;
    const first = parts[0]!;
    if (first.startsWith('@') && parts.length === 1) {
      const macro = first.toLowerCase();
      if (macro === '@reboot') {
        if (dialect === 'k8s') throw new CronError('@reboot is not supported by Kubernetes CronJob (a CronJob always needs a time schedule).');
        if (dialect === 'quartz' || dialect === 'aws') throw new CronError(`@reboot is not supported by ${DIALECT_NAME[dialect]}. Macros such as @daily are Unix and Kubernetes only.`, undefined, 'unix');
        reboot = true;
        return { ok: true, parsed: { dialect, keys: [], fields: [], reboot, expanded: '@reboot', dayRule: 'any' }, warnings, notes: ['@reboot has no schedule: it runs once when the cron daemon starts.'] };
      }
      const exp = MACROS[macro];
      if (!exp) throw new CronError(`Unknown macro "${first}". Supported: ${Object.keys(MACROS).join(', ')}, @reboot (Unix only).`);
      if (dialect === 'quartz' || dialect === 'aws') throw new CronError(`Macros such as ${first} are Unix and Kubernetes only. In ${DIALECT_NAME[dialect]} write the fields out.`, undefined, 'unix');
      parts = exp.split(' ');
      if (dialect === 'unix-seconds') parts = ['0', ...parts];
      notes.push(`${first} expands to "${parts.join(' ')}".`);
    }
    if (/^(CRON_TZ|TZ)=/i.test(first)) {
      throw new CronError(
        dialect === 'k8s'
          ? `${first.split('=')[0]}= inside the schedule is not supported by Kubernetes. Set .spec.timeZone instead.`
          : `${first.split('=')[0]}= prefixes are not part of the expression. Choose the timezone in the timezone selector.`,
      );
    }

    const keys = dialect === 'quartz' ? fieldOrder('quartz', parts.length) : fieldOrder(dialect);
    const okCount = dialect === 'quartz' ? parts.length === 6 || parts.length === 7 : parts.length === keys.length;
    if (!okCount) {
      const want = dialect === 'quartz' ? '6 or 7' : String(keys.length);
      const suggest = suggestDialect(parts.length, input);
      const hint = suggest && suggest !== dialect ? ` This looks like the "${DIALECTS.find((x) => x.id === suggest)!.label}" dialect.` : '';
      throw new CronError(`Expected ${want} fields (${DIALECT_NAME[dialect]}: ${DIALECTS.find((x) => x.id === dialect)!.summary}), found ${parts.length}.${hint}`, undefined, suggest);
    }

    const fields = parts.map((raw, i) => parseField(raw, keys[i]!, dialect, i, warnings));
    const by = (k: FieldKey) => fields.find((f) => f.key === k)!;
    const dom = by('dom');
    const dow = by('dow');
    let dayRule: Parsed['dayRule'];
    if (dialect === 'quartz' || dialect === 'aws') {
      const domI = keys.indexOf('dom');
      const dowI = keys.indexOf('dow');
      if (dom.question && dow.question) throw new CronError('Day-of-month and day-of-week: only one of them may be ?.', domI);
      if (!dom.question && !dow.question) {
        throw new CronError(
          `Day-of-month and day-of-week: one of them must be ? (${DIALECT_NAME[dialect]} cannot restrict both). Put ? in ${dow.any || dow.raw !== '*' ? 'day-of-week' : 'day-of-month'}.`,
          dow.any ? dowI : domI,
        );
      }
      dayRule = dom.question ? 'dow' : 'dom';
    } else if (dom.any && dow.any) dayRule = 'any';
    else if (dom.any) dayRule = 'dow';
    else if (dow.any) dayRule = 'dom';
    else if (dom.star || dow.star) {
      dayRule = 'and';
      notes.push(
        `Day-of-month "${dom.raw}" and day-of-week "${dow.raw}": because one starts with *, both must match (Vixie/cronie and Kubernetes rule), for example "every second day that is also a Friday".`,
      );
    } else {
      dayRule = 'or';
      warnings.push(`Day-of-month and day-of-week are both restricted, so the job runs when EITHER matches: on day ${dom.raw} of the month OR on ${dow.raw} days, not only when both are true.`);
    }
    if (dialect === 'aws') notes.push('EventBridge rules always run in UTC.');
    if (dialect === 'k8s') notes.push('Kubernetes uses the controller timezone (usually UTC) unless .spec.timeZone is set (stable since v1.27).');
    return { ok: true, parsed: { dialect, keys, fields, reboot, expanded: parts.join(' '), dayRule }, warnings, notes };
  } catch (e) {
    if (e instanceof CronError) return { ok: false, error: e.message, fieldIndex: e.fieldIndex, suggest: e.suggest };
    throw e;
  }
}

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Static check for schedules that can never fire, such as 30 February. */
export function neverRuns(p: Parsed): string | null {
  if (p.reboot) return null;
  const f = (k: FieldKey) => p.fields.find((x) => x.key === k);
  const dom = f('dom')!;
  const month = f('month')!;
  if (p.dayRule !== 'dom' && p.dayRule !== 'and') return null;
  if (dom.specials.length || !dom.values.length) return null;
  const minDom = dom.values[0]!;
  const maxDays = Math.max(...month.values.map((m) => MAX_DAYS[m - 1]!));
  if (minDom > maxDays) {
    const names = month.values.map((m) => MONTH_FULL[m - 1]);
    const where = names.length === 1 ? `${names[0]} has` : `${names.join(', ')} have`;
    return `Never runs: ${where} at most ${maxDays} days, but the day-of-month is ${dom.raw}.`;
  }
  return null;
}
