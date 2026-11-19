export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF';

export const BARCODE_FORMATS: { id: BarcodeFormat; label: string; hint: string }[] = [
  { id: 'CODE128', label: 'Code 128', hint: 'Full ASCII text and numbers' },
  { id: 'EAN13', label: 'EAN-13', hint: '12 digits (check digit added) or 13 digits' },
  { id: 'EAN8', label: 'EAN-8', hint: '7 digits (check digit added) or 8 digits' },
  { id: 'UPC', label: 'UPC-A', hint: '11 digits (check digit added) or 12 digits' },
  { id: 'CODE39', label: 'Code 39', hint: 'Uppercase A–Z, 0–9, space, and - . $ / + %' },
  { id: 'ITF', label: 'ITF', hint: 'Even number of digits (prepends 0 if odd)' },
];

export interface BarcodeValidation {
  ok: boolean;
  normalized: string;
  error?: string;
  suggestedFix?: string;
  note?: string;
}

/** Standard GS1 Modulo-10 check digit for EAN-13, EAN-8, and UPC-A payloads (without check digit). */
export function computeGs1CheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  // From rightmost payload digit moving left, weights alternate 3, 1, 3, 1...
  for (let i = digitsWithoutCheck.length - 1, pos = 0; i >= 0; i--, pos++) {
    const d = Number(digitsWithoutCheck[i]);
    sum += d * (pos % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function validateBarcode(format: BarcodeFormat, raw: string): BarcodeValidation {
  const val = raw.trim();
  if (!val) return { ok: false, normalized: val, error: 'Enter a value to generate a barcode.' };

  if (format === 'CODE128') {
    if (/[^\x00-\x7f]/.test(val)) {
      return { ok: false, normalized: val, error: 'Code 128 supports ASCII characters only.' };
    }
    return { ok: true, normalized: val };
  }

  if (format === 'CODE39') {
    const up = val.toUpperCase();
    if (!/^[A-Z0-9\-. $/+%]+$/.test(up)) {
      return { ok: false, normalized: up, error: 'Code 39 allows A–Z, 0–9, space, and - . $ / + % only.' };
    }
    return { ok: true, normalized: up };
  }

  if (format === 'ITF') {
    if (!/^\d+$/.test(val)) return { ok: false, normalized: val, error: 'ITF requires digits (0–9) only.' };
    if (val.length % 2 === 1) {
      return {
        ok: true,
        normalized: `0${val}`,
        note: `ITF requires an even number of digits; prepended 0 (${`0${val}`}).`,
      };
    }
    return { ok: true, normalized: val };
  }

  const expectedBodyLen = format === 'EAN13' ? 12 : format === 'UPC' ? 11 : 7;
  const fullLen = expectedBodyLen + 1;
  if (!/^\d+$/.test(val)) {
    return { ok: false, normalized: val, error: `${format} accepts digits only (expected ${expectedBodyLen} or ${fullLen} digits).` };
  }
  if (val.length === expectedBodyLen) {
    const check = computeGs1CheckDigit(val);
    return {
      ok: true,
      normalized: `${val}${check}`,
      note: `Computed check digit: ${check} (${val}${check}).`,
    };
  }
  if (val.length === fullLen) {
    const body = val.slice(0, expectedBodyLen);
    const check = computeGs1CheckDigit(body);
    const actual = Number(val[expectedBodyLen]);
    if (actual !== check) {
      return {
        ok: false,
        normalized: val,
        error: `Check digit is ${actual}, expected ${check}.`,
        suggestedFix: `${body}${check}`,
      };
    }
    return { ok: true, normalized: val };
  }
  return {
    ok: false,
    normalized: val,
    error: `${format} expects ${expectedBodyLen} digits (without check digit) or ${fullLen} digits, got ${val.length}.`,
  };
}
