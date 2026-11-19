export interface FormatOptions {
  /** 'auto' = up to 6 significant digits; a number = fixed decimals (0 to 12). */
  precision: 'auto' | number;
  /** Switch to scientific notation for very small or very large values. */
  scientific: boolean;
  /** BCP 47 locale, or 'en-US' / 'de-DE' style override for the separators. */
  locale?: string;
}

export const DEFAULT_FORMAT: FormatOptions = { precision: 'auto', scientific: true };

const SCI_LOW = 1e-6;
const SCI_HIGH = 1e12;

export function formatNumber(value: number, o: FormatOptions = DEFAULT_FORMAT): string {
  if (!Number.isFinite(value)) return 'too large';
  if (Object.is(value, -0) || value === 0) return '0';
  const abs = Math.abs(value);
  const sig = o.precision === 'auto' ? 6 : 15;
  const useSci = o.scientific && (abs < SCI_LOW || abs >= SCI_HIGH);
  if (useSci) {
    const digits = o.precision === 'auto' ? 5 : Math.min(12, o.precision);
    const text = value.toExponential(digits).replace(/\.?0+e/, 'e');
    return localizeDecimal(text, o.locale);
  }
  const nf =
    o.precision === 'auto'
      ? new Intl.NumberFormat(o.locale, { maximumSignificantDigits: sig, useGrouping: true })
      : new Intl.NumberFormat(o.locale, { minimumFractionDigits: o.precision, maximumFractionDigits: o.precision });
  // Very tiny values with fixed decimals would print as 0; fall back to significant digits.
  const out = nf.format(value);
  if (o.precision !== 'auto' && Number(out.replace(/[^\d-]/g, '')) === 0 && value !== 0) {
    return new Intl.NumberFormat(o.locale, { maximumSignificantDigits: 6 }).format(value);
  }
  return out;
}

function localizeDecimal(text: string, locale?: string): string {
  const dec = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ?? '.';
  return dec === '.' ? text : text.replace('.', dec);
}

/** Full precision for "Copy exact": 15 significant digits strips floating-point noise. */
export function exactString(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(15)));
}

/** Decimal separator used by a locale, for number parsing. */
export function localeDecimal(locale?: string): '.' | ',' {
  try {
    const dec = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value;
    return dec === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}
