import { formatSql, minifySql, type SqlFormatOptions, type SqlProcessResult } from './sql';

export interface SqlWorkerRequest {
  id: number;
  mode: 'format' | 'minify';
  input: string;
  opts: SqlFormatOptions;
}

self.onmessage = (e: MessageEvent<SqlWorkerRequest>) => {
  const { id, mode, input, opts } = e.data;
  const res: SqlProcessResult =
    mode === 'format'
      ? formatSql(input, opts)
      : minifySql(input, { dialect: opts.dialect, stripCommentsOnMinify: opts.stripCommentsOnMinify });
  (self as unknown as Worker).postMessage({ id, res });
};
