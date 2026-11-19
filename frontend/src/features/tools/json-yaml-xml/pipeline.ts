import { convertText, formatText, parseAny, type FormatOptions, type TextResult } from './formats';
import type { Format, ParseResult } from './model';

export type View = 'format' | 'tree' | 'convert' | 'diff';

export interface PipelineRequest {
  text: string;
  format: Format;
  view: View;
  to: Format;
  opts: FormatOptions;
}

export interface PipelineResponse {
  parse: ParseResult;
  output: TextResult | null;
}

/** Everything the screen needs for one input. Runs on the main thread for small input, in a worker for big input. */
export function runPipeline(req: PipelineRequest): PipelineResponse {
  const parse = parseAny(req.text, req.format, req.opts);
  if (!parse.ok || req.view === 'tree' || req.view === 'diff') return { parse, output: null };
  const output = req.view === 'convert' ? convertText(req.text, req.format, req.to, req.opts) : formatText(req.text, req.format, req.opts);
  return { parse, output };
}

/** Above this many characters the work moves to a Web Worker. */
export const WORKER_THRESHOLD = 2_000_000;
