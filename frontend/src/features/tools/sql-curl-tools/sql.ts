import { format, type KeywordCase, type SqlLanguage } from 'sql-formatter';

export type SqlDialect =
  | 'sql'
  | 'postgresql'
  | 'mysql'
  | 'mariadb'
  | 'sqlite'
  | 'transactsql'
  | 'plsql'
  | 'bigquery'
  | 'snowflake'
  | 'redshift'
  | 'spark';

export const SQL_DIALECTS: { id: SqlDialect; label: string }[] = [
  { id: 'sql', label: 'Standard SQL' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
  { id: 'plsql', label: 'Oracle PL/SQL' },
  { id: 'bigquery', label: 'BigQuery' },
  { id: 'snowflake', label: 'Snowflake' },
  { id: 'redshift', label: 'Redshift' },
  { id: 'spark', label: 'Spark SQL' },
];

export interface SqlFormatOptions {
  dialect: SqlDialect;
  keywordCase: KeywordCase;
  indent: '2' | '4' | 'tab';
  stripCommentsOnMinify: boolean;
  wrapInListAfter: number;
}

export const DEFAULT_SQL_OPTIONS: SqlFormatOptions = {
  dialect: 'sql',
  keywordCase: 'upper',
  indent: '2',
  stripCommentsOnMinify: true,
  wrapInListAfter: 10,
};

export interface SqlProcessResult {
  output: string;
  warning?: string;
  error?: string;
}

type TokenKind = 'ws' | 'string' | 'quoted' | 'lineComment' | 'blockComment' | 'word' | 'punct';

interface SqlToken {
  kind: TokenKind;
  text: string;
}

export function tokenizeSql(input: string, dialect: SqlDialect): SqlToken[] {
  const tokens: SqlToken[] = [];
  const hashComment = dialect === 'mysql' || dialect === 'mariadb';
  const bracketIdent = dialect === 'transactsql';
  const dollarQuote = dialect === 'postgresql' || dialect === 'redshift';

  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j]!)) j++;
      tokens.push({ kind: 'ws', text: input.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === '-' && input[i + 1] === '-') {
      let j = i + 2;
      while (j < input.length && input[j] !== '\n') j++;
      tokens.push({ kind: 'lineComment', text: input.slice(i, j) });
      i = j;
      continue;
    }

    if (hashComment && ch === '#') {
      let j = i + 1;
      while (j < input.length && input[j] !== '\n') j++;
      tokens.push({ kind: 'lineComment', text: input.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === '/' && input[i + 1] === '*') {
      let j = i + 2;
      while (j < input.length && !(input[j] === '*' && input[j + 1] === '/')) j++;
      j = Math.min(input.length, j + 2);
      tokens.push({ kind: 'blockComment', text: input.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === '\\' && (dialect === 'mysql' || dialect === 'mariadb' || dialect === 'spark' || dialect === 'bigquery')) {
          j += 2;
          continue;
        }
        if (input[j] === quote) {
          if (input[j + 1] === quote) {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      tokens.push({ kind: quote === "'" ? 'string' : 'quoted', text: input.slice(i, j) });
      i = j;
      continue;
    }

    if (bracketIdent && ch === '[') {
      let j = i + 1;
      while (j < input.length && input[j] !== ']') j++;
      j = Math.min(input.length, j + 1);
      tokens.push({ kind: 'quoted', text: input.slice(i, j) });
      i = j;
      continue;
    }

    if (dollarQuote && ch === '$') {
      const m = /^\$([A-Za-z0-9_]*)\$/.exec(input.slice(i));
      if (m) {
        const tag = m[0];
        const end = input.indexOf(tag, i + tag.length);
        const j = end === -1 ? input.length : end + tag.length;
        tokens.push({ kind: 'string', text: input.slice(i, j) });
        i = j;
        continue;
      }
    }

    if (/[A-Za-z0-9_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j]!)) j++;
      tokens.push({ kind: 'word', text: input.slice(i, j) });
      i = j;
      continue;
    }

    tokens.push({ kind: 'punct', text: ch });
    i++;
  }
  return tokens;
}

export function tokenStreamsMatch(before: string, after: string, dialect: SqlDialect, ignoreComments = false): boolean {
  const norm = (s: string) =>
    tokenizeSql(s, dialect)
      .filter((t) => t.kind !== 'ws' && (!ignoreComments || (t.kind !== 'lineComment' && t.kind !== 'blockComment')))
      .map((t) => (t.kind === 'word' ? `${t.kind}:${t.text.toLowerCase()}` : `${t.kind}:${t.text}`));
  const a = norm(before);
  const b = norm(after);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function wrapLongInLists(sql: string, afterN: number): string {
  if (afterN <= 0) return sql;
  return sql.replace(/\bIN\s*\(([^()]{120,})\)/gi, (full, inner: string) => {
    const parts: string[] = [];
    let cur = '';
    let inStr = false;
    let quote = '';
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]!;
      if (!inStr && (ch === "'" || ch === '"')) {
        inStr = true;
        quote = ch;
        cur += ch;
      } else if (inStr && ch === quote) {
        if (inner[i + 1] === quote) {
          cur += ch + quote;
          i++;
        } else {
          inStr = false;
          cur += ch;
        }
      } else if (!inStr && ch === ',') {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    if (parts.length <= afterN) return full;
    const chunks: string[] = [];
    for (let i = 0; i < parts.length; i += afterN) {
      chunks.push('  ' + parts.slice(i, i + afterN).join(', '));
    }
    return `IN (\n${chunks.join(',\n')}\n)`;
  });
}

export function formatSql(input: string, opts: SqlFormatOptions): SqlProcessResult {
  if (!input.trim()) return { output: '' };
  try {
    let out = format(input, {
      language: opts.dialect as SqlLanguage,
      keywordCase: opts.keywordCase,
      tabWidth: opts.indent === '4' ? 4 : 2,
      useTabs: opts.indent === 'tab',
      linesBetweenQueries: 2,
    });
    if (opts.wrapInListAfter > 0) {
      const wrapped = wrapLongInLists(out, opts.wrapInListAfter);
      if (tokenStreamsMatch(input, wrapped, opts.dialect)) out = wrapped;
    }
    if (!tokenStreamsMatch(input, out, opts.dialect)) {
      return { output: input, warning: 'Formatting altered the query tokens, so the original SQL is shown unchanged.' };
    }
    return { output: out };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not parse SQL with this dialect.';
    return {
      output: input,
      warning: `Formatted with warnings (check dialect): ${msg}`,
    };
  }
}

export function minifySql(input: string, opts: Pick<SqlFormatOptions, 'dialect' | 'stripCommentsOnMinify'>): SqlProcessResult {
  if (!input.trim()) return { output: '' };
  const tokens = tokenizeSql(input, opts.dialect);
  const kept: SqlToken[] = [];

  for (const tok of tokens) {
    if (tok.kind === 'ws') continue;
    if (tok.kind === 'lineComment') {
      if (opts.stripCommentsOnMinify) continue;
      // Rewrite line comment into block comment so joining lines never swallows subsequent SQL.
      const body = tok.text.replace(/^(--|#)\s?/, '').replace(/\*\//g, '* /').trim();
      kept.push({ kind: 'blockComment', text: `/* ${body} */` });
      continue;
    }
    if (tok.kind === 'blockComment') {
      const isSpecial = tok.text.startsWith('/*!') || tok.text.startsWith('/*+');
      if (opts.stripCommentsOnMinify && !isSpecial) continue;
      kept.push(tok);
      continue;
    }
    kept.push(tok);
  }

  let out = '';
  for (let i = 0; i < kept.length; i++) {
    const cur = kept[i]!;
    const prev = kept[i - 1];
    if (prev) {
      const needsSpace =
        !(prev.kind === 'punct' && (prev.text === '(' || prev.text === '.' || prev.text === ',' || prev.text === ';')) &&
        !(cur.kind === 'punct' && (cur.text === ')' || cur.text === '.' || cur.text === ',' || cur.text === ';')) &&
        !(prev.kind === 'punct' && cur.kind === 'punct' && prev.text === ':' && cur.text === ':');
      if (needsSpace) out += ' ';
    }
    out += cur.text;
  }
  return { output: out.trim() };
}
