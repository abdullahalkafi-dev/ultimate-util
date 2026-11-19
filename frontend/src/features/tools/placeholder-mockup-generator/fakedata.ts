import { Faker, base, en } from '@faker-js/faker';

export type FakeLocale = 'en' | 'bn_BD' | 'ar' | 'de' | 'fr' | 'ja' | 'es';
export type FakeField = 'id' | 'name' | 'email' | 'phone' | 'address' | 'company' | 'birthdate' | 'lorem' | 'avatar';
export type SqlDialect = 'postgresql' | 'mysql' | 'sqlite';

export const FAKE_LOCALES: { id: FakeLocale; label: string }[] = [
  { id: 'en', label: 'English (en)' },
  { id: 'bn_BD', label: 'Bengali (bn_BD)' },
  { id: 'ar', label: 'Arabic (ar)' },
  { id: 'de', label: 'German (de)' },
  { id: 'fr', label: 'French (fr)' },
  { id: 'ja', label: 'Japanese (ja)' },
  { id: 'es', label: 'Spanish (es)' },
];

export const ALL_FIELDS: { id: FakeField; label: string }[] = [
  { id: 'id', label: 'UUID' },
  { id: 'name', label: 'Full name' },
  { id: 'email', label: 'Email (reserved domain)' },
  { id: 'phone', label: 'Phone' },
  { id: 'address', label: 'Address' },
  { id: 'company', label: 'Company' },
  { id: 'birthdate', label: 'Birthdate' },
  { id: 'lorem', label: 'Bio / Lorem' },
  { id: 'avatar', label: 'Avatar initials SVG' },
];

export const FIXED_REF_DATE = '2026-01-01T00:00:00.000Z';
export const FAKER_VERSION_TAG = '10.6.0';
export const MAX_RECORDS = 100_000;

/** Simple deterministic 32-bit FNV-1a hash for independent per-row, per-field seeding. */
export function fieldSeed(seedText: string, rowIndex: number, fieldName: string): number {
  let h = 2166136261;
  const input = `${seedText}|${rowIndex}|${fieldName}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function loadLocaleFaker(locale: FakeLocale): Promise<Faker> {
  if (locale === 'en') return new Faker({ locale: [en, base] });
  if (locale === 'bn_BD') return (await import('@faker-js/faker/locale/bn_BD')).faker;
  if (locale === 'ar') return (await import('@faker-js/faker/locale/ar')).faker;
  if (locale === 'de') return (await import('@faker-js/faker/locale/de')).faker;
  if (locale === 'fr') return (await import('@faker-js/faker/locale/fr')).faker;
  if (locale === 'ja') return (await import('@faker-js/faker/locale/ja')).faker;
  return (await import('@faker-js/faker/locale/es')).faker;
}

function firstGrapheme(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '?';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const first = seg.segment(trimmed)[Symbol.iterator]().next();
    if (!first.done && first.value?.segment) return first.value.segment.toUpperCase();
  }
  return Array.from(trimmed)[0]?.toUpperCase() ?? '?';
}

export function initialsAvatarDataUri(name: string, seedNum: number): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2 ? `${firstGrapheme(parts[0]!)}${firstGrapheme(parts[parts.length - 1]!)}` : firstGrapheme(name);
  const palette = ['#2446f0', '#7440e8', '#d6246e', '#0a8a66', '#c26200', '#0e7490'];
  const bg = palette[seedNum % palette.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${bg}"/><text x="32" y="34" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-weight="700" font-size="24">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const RESERVED_DOMAINS = ['example.com', 'example.org', 'example.test'] as const;

export function generateFakeRows(
  faker: Faker,
  opts: {
    seed: string;
    locale: FakeLocale;
    count: number;
    fields: FakeField[];
    refDate?: string;
  },
): Record<string, string>[] {
  const ref = opts.refDate ?? FIXED_REF_DATE;
  faker.setDefaultRefDate(ref);
  const total = Math.max(1, Math.min(MAX_RECORDS, Math.round(opts.count)));
  const rows: Record<string, string>[] = [];

  for (let i = 0; i < total; i++) {
    const row: Record<string, string> = {};
    // Compute name lazily with fixed field seed if needed by email or avatar
    const nameValue = () => {
      faker.seed(fieldSeed(opts.seed, i, 'name'));
      return faker.person.fullName();
    };

    for (const f of opts.fields) {
      const s = fieldSeed(opts.seed, i, f);
      faker.seed(s);
      switch (f) {
        case 'id':
          row['id'] = faker.string.uuid();
          break;
        case 'name':
          row['name'] = faker.person.fullName();
          break;
        case 'email': {
          const domain = RESERVED_DOMAINS[s % RESERVED_DOMAINS.length]!;
          const local = faker.internet.username().toLowerCase().replace(/[^a-z0-9._-]/g, '') || `user${i + 1}`;
          row['email'] = `${local}@${domain}`;
          break;
        }
        case 'phone':
          row['phone'] = faker.phone.number();
          break;
        case 'address':
          row['address'] = `${faker.location.streetAddress()}, ${faker.location.city()}`;
          break;
        case 'company':
          row['company'] = faker.company.name();
          break;
        case 'birthdate':
          row['birthdate'] = faker.date.birthdate({ min: 18, max: 75, mode: 'age', refDate: ref }).toISOString().slice(0, 10);
          break;
        case 'lorem':
          row['lorem'] = faker.lorem.sentence({ min: 5, max: 10 });
          break;
        case 'avatar':
          row['avatar'] = initialsAvatarDataUri(row['name'] ?? nameValue(), s);
          break;
      }
    }
    rows.push(row);
  }
  return rows;
}

export function exportFakeJson(
  rows: Record<string, string>[],
  meta: { seed: string; locale: FakeLocale; refDate: string },
): string {
  return JSON.stringify(
    {
      _meta: { ...meta, fakerVersion: FAKER_VERSION_TAG, disclaimer: 'All data is synthetic.' },
      records: rows,
    },
    null,
    2,
  );
}

const RISKY_CSV_START = /^[=+\-@\t\r]/;

export function exportFakeCsv(
  rows: Record<string, string>[],
  fields: FakeField[],
  opts: { bom: boolean; guardInjection: boolean },
): string {
  const escapeCell = (raw: string) => {
    const val = opts.guardInjection && RISKY_CSV_START.test(raw) ? `'${raw}` : raw;
    if (/[",\r\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
    return val;
  };
  const header = fields.map(escapeCell).join(',');
  const lines = rows.map((r) => fields.map((f) => escapeCell(r[f] ?? '')).join(','));
  const body = [header, ...lines].join('\r\n');
  return opts.bom ? `\uFEFF${body}` : body;
}

export function sanitizeSqlIdentifier(name: string): { clean: string; changed: boolean } {
  const clean = name.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'fake_users';
  return { clean, changed: clean !== name.trim() };
}

function quoteIdent(id: string, dialect: SqlDialect): string {
  return dialect === 'mysql' ? `\`${id}\`` : `"${id}"`;
}

function escapeSqlLiteral(val: string, dialect: SqlDialect): string {
  let out = val.replace(/'/g, "''");
  if (dialect === 'mysql') out = out.replace(/\\/g, '\\\\');
  return `'${out}'`;
}

export function exportFakeSql(
  rows: Record<string, string>[],
  fields: FakeField[],
  opts: { table: string; dialect: SqlDialect; createTable: boolean },
): string {
  const { clean } = sanitizeSqlIdentifier(opts.table);
  const tq = quoteIdent(clean, opts.dialect);
  const cols = fields.map((f) => quoteIdent(f, opts.dialect)).join(', ');
  const parts: string[] = [];

  if (opts.createTable) {
    const colDefs = fields.map((f) => `  ${quoteIdent(f, opts.dialect)} TEXT`).join(',\n');
    const suffix = opts.dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;' : ';';
    parts.push(`CREATE TABLE ${tq} (\n${colDefs}\n)${suffix}`);
  }

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const values = batch
      .map((r) => `(${fields.map((f) => escapeSqlLiteral(r[f] ?? '', opts.dialect)).join(', ')})`)
      .join(',\n  ');
    parts.push(`INSERT INTO ${tq} (${cols}) VALUES\n  ${values};`);
  }
  return parts.join('\n\n') + '\n';
}
