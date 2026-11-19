import { normalizeInput } from './parse';
import {
  isValidDate,
  resolveLocal,
  resolveZoneText,
  type LocalTime,
  type Resolution,
  type ZoneRef,
  type ZoneResolution,
} from './timezone';

export interface TimeQuery {
  kind: 'time';
  local: LocalTime;
  isNow: boolean;
  from: { label: string; zone: ZoneRef };
  targets: { text: string; resolution: ZoneResolution }[];
  resolution: Resolution;
  ambiguousFrom: Extract<ZoneResolution, { kind: 'ambiguous' }> | null;
}

export type TimeParse =
  | { ok: true; query: TimeQuery }
  | { ok: false; error: string };

function parseTimeOfDay(raw: string): { h: number; mi: number } | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (mi < 0 || mi > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'am') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h < 0 || h > 23) {
    return null;
  }
  return { h, mi };
}

/**
 * Parses queries like:
 *   "3pm IST to PST"
 *   "14:30 UTC in Tokyo, New York"
 *   "2026-03-08 02:30 America/New_York to UTC"
 *   "now UTC to Asia/Dhaka"
 */
export function parseTimeQuery(
  input: string,
  nowMs: number,
  choices: Record<string, string> = {},
): TimeParse | null {
  const text = normalizeInput(input).replace(/(->|=>|→)/g, ' to ');
  const split = /^(.*?)\s+(?:to|in|into|as)\s+(.+)$/i.exec(text);
  if (!split) return null;
  const left = split[1]!.trim();
  const right = split[2]!.trim();

  let isNow = false;
  let y: number;
  let mo: number;
  let d: number;
  const today = new Date(nowMs);
  y = today.getUTCFullYear();
  mo = today.getUTCMonth() + 1;
  d = today.getUTCDate();

  let h = today.getUTCHours();
  let mi = today.getUTCMinutes();
  let zoneText = '';

  const nowMatch = /^now\s+(.+)$/i.exec(left);
  if (nowMatch) {
    isNow = true;
    zoneText = nowMatch[1]!.trim();
  } else {
    const dtMatch = /^(?:(\d{4})-(\d{1,2})-(\d{1,2})\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+)$/i.exec(left);
    if (!dtMatch) return null;
    if (dtMatch[1]) {
      y = Number(dtMatch[1]);
      mo = Number(dtMatch[2]);
      d = Number(dtMatch[3]);
      if (!isValidDate(y, mo, d)) {
        return { ok: false, error: `Invalid date ${dtMatch[1]}-${dtMatch[2]}-${dtMatch[3]}.` };
      }
    }
    const tod = parseTimeOfDay(dtMatch[4]!);
    if (!tod) return null;
    h = tod.h;
    mi = tod.mi;
    zoneText = dtMatch[5]!.trim();
  }

  const fromRes = resolveZoneText(zoneText, nowMs, choices);
  if (fromRes.kind === 'unknown') {
    return { ok: false, error: `Unknown time zone "${zoneText}".` };
  }

  const targetTexts = right.split(',').map((s) => s.trim()).filter(Boolean);
  if (targetTexts.length === 0) return { ok: false, error: 'Enter a target time zone.' };
  const targets = targetTexts.map((t) => ({ text: t, resolution: resolveZoneText(t, nowMs, choices) }));
  const badTarget = targets.find((t) => t.resolution.kind === 'unknown');
  if (badTarget) return { ok: false, error: `Unknown time zone "${badTarget.text}".` };

  if (fromRes.kind === 'ambiguous') {
    return {
      ok: true,
      query: {
        kind: 'time',
        local: { y, mo, d, h, mi },
        isNow,
        from: { label: fromRes.abbr, zone: { kind: 'iana', id: 'UTC' } },
        targets,
        resolution: { status: 'ok', utcMs: nowMs },
        ambiguousFrom: fromRes,
      },
    };
  }

  const local: LocalTime = { y, mo, d, h, mi };
  const resolution = isNow
    ? { status: 'ok' as const, utcMs: nowMs }
    : resolveLocal(local, fromRes.zone);

  return {
    ok: true,
    query: {
      kind: 'time',
      local,
      isNow,
      from: { label: fromRes.label, zone: fromRes.zone },
      targets,
      resolution,
      ambiguousFrom: null,
    },
  };
}
