import { describe, expect, it } from 'vitest';
import { computeGs1CheckDigit, validateBarcode } from './barcode';
import {
  autoEccForLogo,
  formatEmailPayload,
  formatEventPayload,
  formatVCardPayload,
  formatWifiPayload,
  parseVCardPayload,
  parseWifiPayload,
} from './payloads';
import { inspectDecodedContent } from './safety';

describe('qr-barcode logic', () => {
  it('escapes and round-trips Wi-Fi SSID and password characters', () => {
    const payload = formatWifiPayload({
      ssid: 'a;b:"c\\d',
      password: 'p,a;s:s\\"',
      auth: 'WPA',
      hidden: true,
    });
    expect(payload).toContain('H:true');
    const parsed = parseWifiPayload(payload);
    expect(parsed).toEqual({
      ssid: 'a;b:"c\\d',
      password: 'p,a;s:s\\"',
      auth: 'WPA',
      hidden: true,
    });
  });

  it('quotes hex-only Wi-Fi passwords per ZXing format', () => {
    const payload = formatWifiPayload({ ssid: 'Cafe', password: 'deadbeef', auth: 'WPA', hidden: false });
    expect(payload).toContain('P:"deadbeef"');
    expect(parseWifiPayload(payload)?.password).toBe('deadbeef');
  });

  it('formats vCard, email and VEVENT calendar payloads', () => {
    const vcard = formatVCardPayload({
      firstName: 'Ada',
      lastName: 'Lovelace',
      org: 'Analytical, Inc.',
      title: 'Engineer',
      phone: '+123456',
      email: 'ada@example.com',
      url: 'https://example.com',
    });
    const parsed = parseVCardPayload(vcard);
    expect(parsed?.FN).toBe('Ada Lovelace');
    expect(parsed?.ORG).toBe('Analytical, Inc.');

    expect(formatEmailPayload({ to: 'a@example.com', subject: 'Hi', body: 'Hello' })).toContain('mailto:a@example.com');
    const ics = formatEventPayload({
      title: 'Launch, Day',
      start: '2026-11-19T09:00',
      end: '2026-11-19T10:00',
      location: 'Room 1',
      description: 'Line1\nLine2',
      utc: true,
    });
    expect(ics).toContain('SUMMARY:Launch\\, Day');
    expect(ics).toContain('DTSTART:20261119T090000Z');
  });

  it('validates and computes EAN-13, EAN-8, UPC-A check digits and rejects wrong ones', () => {
    expect(computeGs1CheckDigit('400638133393')).toBe(1);
    const added = validateBarcode('EAN13', '400638133393');
    expect(added.ok).toBe(true);
    expect(added.normalized).toBe('4006381333931');

    const wrong = validateBarcode('EAN13', '4006381333939');
    expect(wrong.ok).toBe(false);
    expect(wrong.suggestedFix).toBe('4006381333931');

    expect(validateBarcode('UPC', '03600029145').normalized).toBe('036000291452');
    expect(validateBarcode('EAN8', '9638507').normalized).toBe('96385074');
  });

  it('validates Code39 and ITF formats', () => {
    expect(validateBarcode('CODE39', 'abc-123').normalized).toBe('ABC-123');
    expect(validateBarcode('CODE39', 'bad@char').ok).toBe(false);
    expect(validateBarcode('ITF', '123').normalized).toBe('0123');
  });

  it('auto-raises ECC when a logo is present', () => {
    expect(autoEccForLogo('L', 0.15)).toBe('Q');
    expect(autoEccForLogo('Q', 0.25)).toBe('H');
  });

  it('blocks javascript/data schemes and flags suspicious hosts', () => {
    expect(inspectDecodedContent('javascript:alert(1)').blocked).toBe(true);
    expect(inspectDecodedContent('data:text/html,<h1>x</h1>').blocked).toBe(true);
    const short = inspectDecodedContent('https://bit.ly/abc');
    expect(short.blocked).toBe(false);
    expect(short.warnings.length).toBeGreaterThan(0);
    const ip = inspectDecodedContent('http://192.168.1.1/login');
    expect(ip.warnings.length).toBeGreaterThanOrEqual(2);
  });
});
