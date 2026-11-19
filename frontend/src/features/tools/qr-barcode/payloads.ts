export type QrType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'sms' | 'phone' | 'geo' | 'event';
export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export const QR_MAX_BYTES: Record<EccLevel, number> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

export interface WifiInput {
  ssid: string;
  password: string;
  auth: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export interface VCardInput {
  firstName: string;
  lastName: string;
  org: string;
  title: string;
  phone: string;
  email: string;
  url: string;
}

export interface EmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface SmsInput {
  phone: string;
  message: string;
}

export interface GeoInput {
  lat: string;
  lon: string;
}

export interface EventInput {
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
  utc: boolean;
}

const HEX_ONLY = /^[0-9a-f]+$/i;

export function escapeWifiField(val: string): string {
  const escaped = val.replace(/([\\;,:"])/g, '\\$1');
  // Per ZXing convention, hex-only strings that are meant as literal text are wrapped in double quotes.
  return val.length > 0 && HEX_ONLY.test(val) ? `"${escaped}"` : escaped;
}

export function formatWifiPayload(w: WifiInput): string {
  const parts = [`T:${w.auth}`, `S:${escapeWifiField(w.ssid)}`];
  if (w.auth !== 'nopass') parts.push(`P:${escapeWifiField(w.password)}`);
  if (w.hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

export function parseWifiPayload(raw: string): WifiInput | null {
  if (!raw.startsWith('WIFI:')) return null;
  const body = raw.slice(5);
  const fields: Record<string, string> = {};
  let key = '';
  let val = '';
  let readingKey = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '\\' && i + 1 < body.length) {
      val += body[i + 1];
      i++;
      continue;
    }
    if (ch === ':' && readingKey) {
      readingKey = false;
      continue;
    }
    if (ch === ';') {
      if (key) {
        let cleaned = val;
        if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
          cleaned = cleaned.slice(1, -1);
        }
        fields[key] = cleaned;
      }
      key = '';
      val = '';
      readingKey = true;
      continue;
    }
    if (readingKey) key += ch;
    else val += ch;
  }
  const auth = fields['T'] === 'WEP' ? 'WEP' : fields['T'] === 'nopass' ? 'nopass' : 'WPA';
  return {
    ssid: fields['S'] ?? '',
    password: fields['P'] ?? '',
    auth,
    hidden: fields['H'] === 'true',
  };
}

function escapeVCard(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function formatVCardPayload(v: VCardInput): string {
  const fn = [v.firstName.trim(), v.lastName.trim()].filter(Boolean).join(' ') || 'Contact';
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCard(v.lastName.trim())};${escapeVCard(v.firstName.trim())};;;`,
    `FN:${escapeVCard(fn)}`,
  ];
  if (v.org.trim()) lines.push(`ORG:${escapeVCard(v.org.trim())}`);
  if (v.title.trim()) lines.push(`TITLE:${escapeVCard(v.title.trim())}`);
  if (v.phone.trim()) lines.push(`TEL;TYPE=CELL:${v.phone.trim()}`);
  if (v.email.trim()) lines.push(`EMAIL:${v.email.trim()}`);
  if (v.url.trim()) lines.push(`URL:${v.url.trim()}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export function parseVCardPayload(raw: string): Record<string, string> | null {
  if (!/^BEGIN:VCARD/i.test(raw.trim())) return null;
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const k = line.slice(0, colon).split(';')[0]!.toUpperCase();
    const v = line.slice(colon + 1).replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');
    if (k !== 'BEGIN' && k !== 'END' && k !== 'VERSION' && v) out[k] = v;
  }
  return out;
}

function formatIcalTime(dtLocal: string, utc: boolean): string {
  const clean = dtLocal.replace(/[-:]/g, '').replace(/\.\d+$/, '');
  const base = clean.length === 13 ? `${clean}00` : clean.length >= 15 ? clean.slice(0, 15) : clean;
  return utc && base && !base.endsWith('Z') ? `${base}Z` : base;
}

function escapeIcal(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function formatEventPayload(ev: EventInput): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT'];
  if (ev.title.trim()) lines.push(`SUMMARY:${escapeIcal(ev.title.trim())}`);
  if (ev.start) lines.push(`DTSTART:${formatIcalTime(ev.start, ev.utc)}`);
  if (ev.end) lines.push(`DTEND:${formatIcalTime(ev.end, ev.utc)}`);
  if (ev.location.trim()) lines.push(`LOCATION:${escapeIcal(ev.location.trim())}`);
  if (ev.description.trim()) lines.push(`DESCRIPTION:${escapeIcal(ev.description.trim())}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\n');
}

export function formatEmailPayload(e: EmailInput): string {
  const params = new URLSearchParams();
  if (e.subject.trim()) params.set('subject', e.subject);
  if (e.body.trim()) params.set('body', e.body);
  const qs = params.toString();
  return `mailto:${e.to.trim()}${qs ? `?${qs}` : ''}`;
}

export function formatSmsPayload(s: SmsInput): string {
  return s.message ? `SMSTO:${s.phone.trim()}:${s.message}` : `SMSTO:${s.phone.trim()}`;
}

export function qrByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function autoEccForLogo(chosen: EccLevel, logoRatio: number): EccLevel {
  if (logoRatio <= 0) return chosen;
  if (logoRatio > 0.2) return 'H';
  if (chosen === 'L' || chosen === 'M') return 'Q';
  return chosen;
}
