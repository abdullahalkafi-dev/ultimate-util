import {
  ABSOLUTE_ZERO_C,
  UNIT_BY_ID,
  categoryLabel,
  findUnit,
  suggestUnits,
  type UnitDef,
} from './units';

export interface Ambiguity {
  key: string;
  options: UnitDef[];
  chosen: UnitDef;
}

export interface NumberReading {
  value: number;
  label: string;
}

export interface UnitQuery {
  kind: 'unit';
  /** Amount as typed, in the "from" unit (first unit for compound input). */
  amount: number;
  from: UnitDef;
  to: UnitDef | null;
  /** Compound input such as "5 ft 3 in". */
  compoundText: string | null;
  /** Value in the "to" unit, or null when no target unit was given. */
  value: number | null;
  baseValue: number;
  notes: string[];
  ambiguities: Ambiguity[];
  numberReadings: NumberReading[] | null;
}

export type UnitParse =
  | { ok: true; query: UnitQuery }
  | { ok: false; error: string; suggestions: string[]; rank: number };

export interface ParseOptions {
  /** Decimal separator of the user's locale; decides ambiguous "1,500". */
  decimal?: '.' | ',';
  /** User picks for variant words (key = typed word, value = unit id). */
  choices?: Record<string, string>;
  /** When "1,500" is ambiguous: use the other reading. */
  alternateNumber?: boolean;
}

const SEPARATORS = new Set(['to', 'in', 'as', 'into', '->']);

/** Arabic-Indic and Persian digits to ASCII, typographic minus and spaces. */
export function normalizeInput(input: string): string {
  return input
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[−–]/g, '-')
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/ /g, ' ')
    .trim();
}

interface NumberParse {
  value: number;
  readings: NumberReading[] | null;
}

/** Parses a number token with locale-aware separators. Returns null when it is not a number. */
export function parseNumberToken(raw: string, decimal: '.' | ',' = '.', alternate = false): NumberParse | null {
  const m = /^([-+]?)(\d[\d.,]*|\.\d+|,\d+)(?:e([-+]?\d+))?$/i.exec(raw);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const body = m[2]!;
  const exp = m[3] ? Number(m[3]) : 0;
  const finish = (n: number, readings: NumberReading[] | null): NumberParse | null =>
    Number.isFinite(n) ? { value: sign * n * 10 ** exp, readings } : null;

  const dots = (body.match(/\./g) ?? []).length;
  const commas = (body.match(/,/g) ?? []).length;
  if (dots === 0 && commas === 0) return finish(Number(body), null);

  if (dots > 0 && commas > 0) {
    // Whichever comes last is the decimal mark.
    const dec = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
    const group = dec === '.' ? ',' : '.';
    const cleaned = body.split(group).join('').replace(dec, '.');
    if (body.split(dec).length > 2) return null;
    return finish(Number(cleaned), null);
  }

  const sep = dots > 0 ? '.' : ',';
  const parts = body.split(sep);
  if (parts.length > 2) {
    // Repeated separator can only be grouping: every group after the first must have 3 digits.
    if (!parts.slice(1).every((p) => p.length === 3)) return null;
    return finish(Number(parts.join('')), null);
  }
  const [head, tail] = parts as [string, string];
  const asDecimal = Number(`${head || '0'}.${tail}`);
  const asGroup = Number(`${head}${tail}`);
  if (tail.length === 3 && head.length >= 1 && head !== '0') {
    const decimalFirst = sep === decimal;
    const primary = decimalFirst ? asDecimal : asGroup;
    const other = decimalFirst ? asGroup : asDecimal;
    const readings: NumberReading[] = [
      { value: primary, label: decimalFirst ? `${head}.${tail} (decimal)` : `${head}${tail} (thousands)` },
      { value: other, label: decimalFirst ? `${head}${tail} (thousands)` : `${head}.${tail} (decimal)` },
    ];
    return finish(alternate ? other : primary, readings);
  }
  return finish(asDecimal, null);
}

interface Pair {
  numText: string | null;
  unitText: string;
}

function scanPairs(tokens: string[]): Pair[] {
  const pairs: Pair[] = [];
  for (const tok of tokens) {
    const num = /^([-+]?(?:\d[\d.,]*|\.\d+)(?:e[-+]?\d+)?)(.*)$/i.exec(tok);
    const last = pairs[pairs.length - 1];
    if (num) {
      const numText = num[1]!;
      const rest = num[2]!;
      const frac = /^\/(\d+)(.*)$/.exec(rest);
      if (frac) {
        // "1/2" or "3/4cup": a fraction, possibly after a whole number ("1 1/2").
        const whole = last && last.unitText === '' && /^\d+$/.test(last.numText ?? '') ? Number(last.numText) : 0;
        const value = whole + Number(numText) / Number(frac[1]);
        if (whole && last) {
          last.numText = String(value);
          last.unitText = frac[2]!.trim();
        } else {
          pairs.push({ numText: String(value), unitText: frac[2]!.trim() });
        }
        continue;
      }
      pairs.push({ numText, unitText: rest.trim() });
    } else if (last) {
      last.unitText = `${last.unitText} ${tok}`.trim();
    } else {
      pairs.push({ numText: null, unitText: tok });
    }
  }
  return pairs;
}

const fail = (error: string, rank: number, suggestions: string[] = []): UnitParse => ({ ok: false, error, suggestions, rank });

interface ResolvedUnit {
  unit: UnitDef;
  ambiguity: Ambiguity | null;
  fuzzy: string | null;
}

function resolveUnit(text: string, opts: ParseOptions): ResolvedUnit | null {
  const match = findUnit(text);
  if (!match) return null;
  const options = match.ids.map((id) => UNIT_BY_ID.get(id)!);
  const picked = opts.choices?.[match.key];
  const chosen = options.find((u) => u.id === picked) ?? options[0]!;
  return {
    unit: chosen,
    ambiguity: options.length > 1 ? { key: match.key, options, chosen } : null,
    fuzzy: match.fuzzyFrom ? `${match.fuzzyFrom} as ${chosen.label}` : null,
  };
}

function attempt(left: string[], right: string[], opts: ParseOptions): UnitParse {
  const pairs = scanPairs(left);
  if (pairs.length === 0) return fail('Type an amount and a unit, like "5 km in miles".', 0);

  const notes: string[] = [];
  const ambiguities: Ambiguity[] = [];
  let readings: NumberReading[] | null = null;
  const resolved: { value: number; unit: UnitDef }[] = [];
  for (const p of pairs) {
    if (!p.unitText) return fail(`"${p.numText}" needs a unit.`, 0);
    let value = 1;
    if (p.numText !== null) {
      const n = parseNumberToken(p.numText, opts.decimal ?? '.', opts.alternateNumber);
      if (!n) return fail(`"${p.numText}" is not a valid number.`, 1);
      value = n.value;
      readings ??= n.readings;
    }
    const r = resolveUnit(p.unitText, opts);
    if (!r) return fail(`Unknown unit "${p.unitText}".`, 1, suggestUnits(p.unitText));
    if (r.ambiguity && !ambiguities.some((a) => a.key === r.ambiguity!.key)) ambiguities.push(r.ambiguity);
    if (r.fuzzy) notes.push(`Understood ${r.fuzzy}.`);
    resolved.push({ value, unit: r.unit });
  }

  const first = resolved[0]!;
  let compoundText: string | null = null;
  let baseValue = first.unit.toBase(first.value);
  if (resolved.length > 1) {
    const cat = first.unit.category;
    if (!resolved.every((r) => r.unit.category === cat) || (cat !== 'length' && cat !== 'mass')) {
      return fail('Combined amounts like "5 ft 3 in" work for length and mass only.', 1);
    }
    baseValue = resolved.reduce((s, r) => s + r.unit.toBase(r.value), 0);
    compoundText = resolved.map((r) => `${r.value} ${r.unit.symbol}`).join(' + ');
  }

  let to: UnitDef | null = null;
  if (right.length > 0) {
    const text = right.join(' ');
    const r = resolveUnit(text, opts);
    if (!r) return fail(`Unknown unit "${text}".`, 2, suggestUnits(text));
    if (r.ambiguity && !ambiguities.some((a) => a.key === r.ambiguity!.key)) ambiguities.push(r.ambiguity);
    if (r.fuzzy) notes.push(`Understood ${r.fuzzy}.`);
    to = r.unit;
    if (to.category !== first.unit.category) {
      return fail(
        `${first.unit.symbol} is ${categoryLabel(first.unit.category)}, ${to.symbol} is ${categoryLabel(to.category)}. Pick a ${categoryLabel(first.unit.category)} unit instead.`,
        3,
      );
    }
  }

  const cat = first.unit.category;
  if (cat === 'temperature' && baseValue < ABSOLUTE_ZERO_C - 1e-9) {
    return fail(`${first.value} ${first.unit.symbol} is below absolute zero.`, 4);
  }
  if (cat === 'fuel' && resolved.some((r) => r.value === 0)) return fail('Fuel economy of 0 is not a valid value.', 4);
  if (!Number.isFinite(baseValue)) return fail('That number is too large.', 4);
  if ((cat === 'area' || cat === 'volume') && first.value < 0) notes.push(`A negative ${cat} is unusual; check the sign.`);
  if (cat === 'temperature') notes.push('For a temperature change (a difference), convert with the scale factor only: 10 °C change = 18 °F change.');

  const value = to ? to.fromBase(baseValue) : null;
  if (value !== null && !Number.isFinite(value)) {
    return fail(cat === 'fuel' ? 'That value converts to infinity. Fuel economy of 0 is not valid.' : 'The result is too large to show.', 4);
  }
  if (to && first.unit.family && to.family && first.unit.family !== to.family) {
    const label = (f: string) => (f === 'si' ? 'decimal (1 GB = 1,000,000,000 bytes)' : f === 'iec' ? 'binary (1 GiB = 1,073,741,824 bytes)' : 'bits (8 bits = 1 byte)');
    notes.push(`Mixing families: ${first.unit.symbol} is ${label(first.unit.family)}; ${to.symbol} is ${label(to.family)}.`);
  }

  return {
    ok: true,
    query: { kind: 'unit', amount: first.value, from: first.unit, to, compoundText, value, baseValue, notes, ambiguities, numberReadings: readings },
  };
}

/** Parses "<number> <unit> (to|in|as|->) <unit>". Every possible split is tried, so "5 in in cm" works. */
export function parseUnitQuery(input: string, opts: ParseOptions = {}): UnitParse {
  const text = normalizeInput(input)
    .replace(/(->|=>|→)/g, ' -> ')
    .replace(/(['′"″])/g, ' $1 ');
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return fail('', 0);

  const attempts: UnitParse[] = [];
  tokens.forEach((tok, i) => {
    if (i > 0 && SEPARATORS.has(tok.toLowerCase())) attempts.push(attempt(tokens.slice(0, i), tokens.slice(i + 1), opts));
  });
  attempts.push(attempt(tokens, [], opts));
  const win = attempts.find((a) => a.ok);
  if (win) return win;
  return (attempts as Extract<UnitParse, { ok: false }>[]).reduce((best, a) => (a.rank > best.rank ? a : best));
}
