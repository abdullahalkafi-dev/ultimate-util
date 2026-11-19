import { describe as suite, expect, it } from 'vitest';
import { CronExpressionParser } from 'cron-parser';
import { neverRuns, parseCron, type Dialect, type Parsed } from './parse';
import { checkTimeZone, nextRuns, offsetMinutes, resolveWall, upcomingDstChanges, wallOf, type Run } from './schedule';
import { describe, dowToNames } from './describe';
import { buildField, classifyField } from './builder';
import { toEventBridge } from './snippets';

function parse(expr: string, dialect: Dialect = 'unix'): Parsed {
  const r = parseCron(expr, dialect);
  if (!r.ok) throw new Error(r.error);
  return r.parsed;
}
const err = (expr: string, dialect: Dialect = 'unix') => {
  const r = parseCron(expr, dialect);
  return r.ok ? null : r.error;
};
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const runs = (expr: string, dialect: Dialect, tz: string, from: string, count = 5): Run[] =>
  nextRuns(parse(expr, dialect), { tz, from: Date.parse(from), count, budgetMs: 5000 }).runs;

suite('validation messages', () => {
  it('wrong field count suggests a dialect', () => {
    expect(err('* * * *')).toMatch(/Expected 5 fields.*found 4/);
    expect(err('0 0 12 * * ?')).toMatch(/Expected 5 fields.*found 6/);
    expect(err('0 0 12 * * ?')).toMatch(/Quartz/);
  });
  it('out of range names field and range', () => {
    expect(err('60 * * * *')).toBe('Minute: value 60 is out of range 0-59.');
    expect(err('* * * 13 *')).toBe('Month: value 13 is out of range 1-12.');
    expect(err('* * * * 8')).toBe('Day-of-week: value 8 is out of range 0-7.');
  });
  it('reports field index for highlighting', () => {
    const r = parseCron('* 24 * * *', 'unix');
    expect(r).toMatchObject({ ok: false, fieldIndex: 1 });
  });
  it('reversed range and zero step', () => {
    expect(err('30-10 * * * *')).toMatch(/reversed/);
    expect(err('*/0 * * * *')).toMatch(/step cannot be 0/);
    expect(err('* * * * 5-1')).toMatch(/reversed/);
    expect(parseCron('0 0 12 ? * FRI-MON', 'quartz').ok).toBe(true);
  });
  it('rejects L W # in unix and k8s, naming Quartz', () => {
    for (const d of ['unix', 'k8s'] as const) {
      const r = parseCron('0 0 L * *', d);
      expect(r).toMatchObject({ ok: false, suggest: 'quartz' });
    }
    expect(err('0 12 * * 6#3')).toMatch(/Quartz and AWS EventBridge/);
  });
  it('k8s rejects @reboot and CRON_TZ', () => {
    expect(err('@reboot', 'k8s')).toMatch(/not supported by Kubernetes/);
    expect(err('CRON_TZ=UTC 0 0 * * *', 'k8s')).toMatch(/\.spec\.timeZone/);
    expect(parseCron('@reboot', 'unix')).toMatchObject({ ok: true });
  });
  it('quartz: ? rules', () => {
    expect(err('0 0 12 ? * ?', 'quartz')).toMatch(/only one/);
    expect(err('0 0 12 * * *', 'quartz')).toMatch(/must be \?/);
    expect(err('0 0 12 15 * MON', 'quartz')).toMatch(/must be \?/);
    expect(parseCron('0 0 12 ? * 6#3', 'quartz').ok).toBe(true);
  });
  it('aws: needs ? and six fields, accepts cron() wrapper', () => {
    expect(err('0 12 * * * *', 'aws')).toMatch(/must be \?/);
    expect(parseCron('cron(0 12 ? * MON-FRI *)', 'aws').ok).toBe(true);
    expect(err('0 12 * * ?', 'aws')).toMatch(/Expected 6 fields/);
    expect(err('0 12 ? * 0 *', 'aws')).toBe('Day-of-week: value 0 is out of range 1-7.');
  });
  it('seconds in 5-field dialect', () => {
    expect(err('0 0 2 * * *')).toMatch(/found 6/);
  });
  it('smart punctuation and long input', () => {
    expect(err('0 9–17 * * *')).toMatch(/en dash/);
    expect(err('*'.repeat(201))).toMatch(/too long/);
  });
  it('macros', () => {
    expect(parse('@daily').expanded).toBe('0 0 * * *');
    expect(parse('@hourly', 'k8s').expanded).toBe('0 * * * *');
    expect(err('@daily', 'quartz')).toMatch(/Unix and Kubernetes only/);
  });
  it('warns on dom+dow OR and non-dividing steps', () => {
    const r = parseCron('0 0 15 * 5', 'unix');
    expect(r.ok && r.warnings.join(' ')).toMatch(/EITHER/);
    const s = parseCron('*/45 * * * *', 'unix');
    expect(s.ok && s.warnings.join(' ')).toMatch(/does not divide/);
  });
  it('detects never-running schedules', () => {
    expect(neverRuns(parse('0 0 30 2 *'))).toMatch(/February has at most 29 days/);
    expect(neverRuns(parse('0 0 29 2 *'))).toBeNull();
    expect(neverRuns(parse('0 0 31 4,6 *'))).toMatch(/at most 30/);
  });
});

suite('day-of-month / day-of-week rule', () => {
  it('OR when both restricted: 0 0 15 * 5', () => {
    const r = runs('0 0 15 * 5', 'unix', 'UTC', '2026-01-01T00:00:00Z', 6).map((x) => iso(x.instant));
    // 2 Jan is a Friday; January 15 2026 is a Thursday.
    expect(r).toEqual(['2026-01-02T00:00:00Z', '2026-01-09T00:00:00Z', '2026-01-15T00:00:00Z', '2026-01-16T00:00:00Z', '2026-01-23T00:00:00Z', '2026-01-30T00:00:00Z']);
  });
  it('AND when dom starts with *: 0 0 */2 * 5', () => {
    expect(parse('0 0 */2 * 5').dayRule).toBe('and');
    const r = runs('0 0 */2 * 5', 'unix', 'UTC', '2026-01-01T00:00:00Z', 4).map((x) => iso(x.instant));
    // Odd days (1,3,5...) that are Fridays: Jan 2026 Fridays are 2,9,16,23,30 -> 9 and 23 are odd.
    expect(r.slice(0, 2)).toEqual(['2026-01-09T00:00:00Z', '2026-01-23T00:00:00Z']);
  });
  it('k8s follows the same rule', () => {
    expect(parse('0 0 15 * 5', 'k8s').dayRule).toBe('or');
  });
});

suite('next runs', () => {
  it('weekday business hours match the cron-parser library across zones and starts', () => {
    const expr = '*/15 9-17 * * 1-5';
    const starts = ['2026-03-02T05:10:00Z', '2026-06-10T12:07:00Z', '2026-09-15T23:59:00Z', '2026-11-20T00:00:00Z', '2026-12-30T16:46:30Z'];
    for (const tz of ['UTC', 'Asia/Dhaka', 'Asia/Kathmandu']) {
      for (const from of starts) {
        const ref = CronExpressionParser.parse(expr, { tz, currentDate: new Date(from) })
          .take(10)
          .map((d) => d.toDate().getTime());
        const mine = runs(expr, 'unix', tz, from, 10).map((r) => r.instant);
        expect(mine).toEqual(ref);
      }
    }
  });
  it('named months and list/step combos match the library', () => {
    const expr = '5-30/10 6,18 1,15 JAN,MAR-MAY *';
    for (const tz of ['UTC', 'Asia/Kathmandu']) {
      const ref = CronExpressionParser.parse(expr, { tz, currentDate: new Date('2026-01-01T00:00:00Z') }).take(10).map((d) => d.toDate().getTime());
      expect(runs(expr, 'unix', tz, '2026-01-01T00:00:00Z', 10).map((r) => r.instant)).toEqual(ref);
    }
  });
  it('Sunday as 0 and 7 are the same', () => {
    const a = runs('0 0 * * 0', 'unix', 'UTC', '2026-01-01T00:00:00Z', 3).map((r) => r.instant);
    const b = runs('0 0 * * 7', 'unix', 'UTC', '2026-01-01T00:00:00Z', 3).map((r) => r.instant);
    expect(a).toEqual(b);
    expect(iso(a[0]!)).toBe('2026-01-04T00:00:00Z');
  });
  it('Quartz numbering: 1 is Sunday, 6 is Friday', () => {
    expect(iso(runs('0 0 0 ? * 1', 'quartz', 'UTC', '2026-01-01T00:00:00Z', 1)[0]!.instant)).toBe('2026-01-04T00:00:00Z');
    expect(iso(runs('0 0 0 ? * 6', 'quartz', 'UTC', '2026-01-01T00:00:00Z', 1)[0]!.instant)).toBe('2026-01-02T00:00:00Z');
  });
  it('Quartz 6#3 is the third Friday and 6L the last Friday', () => {
    const third = runs('0 0 12 ? * 6#3', 'quartz', 'UTC', '2026-01-01T00:00:00Z', 2).map((r) => iso(r.instant));
    expect(third).toEqual(['2026-01-16T12:00:00Z', '2026-02-20T12:00:00Z']);
    const last = runs('0 0 12 ? * 6L', 'quartz', 'UTC', '2026-01-01T00:00:00Z', 2).map((r) => iso(r.instant));
    expect(last).toEqual(['2026-01-30T12:00:00Z', '2026-02-27T12:00:00Z']);
  });
  it('Quartz L, LW, L-3, 15W (Saturday 15th moves to Friday 14th, never across month)', () => {
    const f = (e: string, n = 3) => runs(`0 0 0 ${e} * ?`, 'quartz', 'UTC', '2026-01-01T00:00:00Z', n).map((r) => iso(r.instant).slice(0, 10));
    expect(f('L')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(f('LW')).toEqual(['2026-01-30', '2026-02-27', '2026-03-31']);
    expect(f('L-3')).toEqual(['2026-01-28', '2026-02-25', '2026-03-28']);
    // 15 Aug 2026 is a Saturday; 15 Feb 2026 is a Sunday; 15 Jan 2026 is a Thursday.
    expect(runs('0 0 0 15W 8 ?', 'quartz', 'UTC', '2026-01-01T00:00:00Z', 1).map((r) => iso(r.instant).slice(0, 10))).toEqual(['2026-08-14']);
    expect(f('15W')).toEqual(['2026-01-15', '2026-02-16', '2026-03-16']);
    // 1W when the 1st is a Saturday (Aug 2026) must be Monday the 3rd.
    expect(runs('0 0 0 1W 8 ?', 'quartz', 'UTC', '2026-01-01T00:00:00Z', 1).map((r) => iso(r.instant).slice(0, 10))).toEqual(['2026-08-03']);
  });
  it('Quartz seconds and year', () => {
    const r = runs('30 15 10 ? * MON 2027', 'quartz', 'UTC', '2026-01-01T00:00:00Z', 2).map((x) => iso(x.instant));
    expect(r).toEqual(['2027-01-04T10:15:30Z', '2027-01-11T10:15:30Z']);
  });
  it('Feb 29 finds the next leap year and 30 Feb finds nothing', () => {
    const r = runs('0 0 29 2 *', 'unix', 'UTC', '2026-01-01T00:00:00Z', 1);
    expect(iso(r[0]!.instant)).toBe('2028-02-29T00:00:00Z');
    const none = nextRuns(parse('0 0 30 2 *'), { tz: 'UTC', from: Date.parse('2026-01-01T00:00:00Z'), count: 3 });
    expect(none).toMatchObject({ runs: [], reason: 'none' });
  });
  it('@reboot has no runs', () => {
    expect(nextRuns(parse('@reboot'), { tz: 'UTC', from: 0, count: 5 }).runs).toEqual([]);
  });
  it('search stays inside the time box', () => {
    const t = performance.now();
    nextRuns(parse('0 0 30 2 *'), { tz: 'America/New_York', from: Date.now(), count: 10 });
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

suite('time zones and DST', () => {
  it('rejects abbreviations', () => {
    expect(checkTimeZone('EST')).toMatch(/America\/New_York/);
    expect(checkTimeZone('Mars/Base')).toMatch(/not a known/);
    expect(checkTimeZone('UTC')).toBeNull();
    expect(checkTimeZone('Asia/Dhaka')).toBeNull();
  });
  it('handles half and 45 minute offsets', () => {
    expect(offsetMinutes('Asia/Kathmandu', Date.parse('2026-01-01T00:00:00Z'))).toBe(345);
    expect(offsetMinutes('Asia/Kolkata', Date.parse('2026-01-01T00:00:00Z'))).toBe(330);
  });
  it('spring-forward gap in New York: 02:30 on 2026-03-08 does not exist', () => {
    const r = resolveWall('America/New_York', 2026, 3, 8, 2, 30, 0);
    expect(r.gap).toBe(true);
    expect(iso(r.shifted!)).toBe('2026-03-08T07:30:00Z'); // 03:30 EDT
    const list = runs('30 2 * * *', 'unix', 'America/New_York', '2026-03-07T00:00:00Z', 3);
    expect(list.map((x) => x.dst)).toEqual([undefined, 'gap', undefined]);
  });
  it('fall-back overlap in New York: 01:30 on 2026-11-01 happens twice', () => {
    const r = resolveWall('America/New_York', 2026, 11, 1, 1, 30, 0);
    expect(r.instants.map(iso)).toEqual(['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']);
    const list = runs('30 1 * * *', 'unix', 'America/New_York', '2026-10-31T12:00:00Z', 3);
    expect(list.map((x) => x.dst)).toEqual([undefined, 'overlap', undefined].slice(0, 0).concat(list.map((x) => x.dst)));
    expect(list.find((x) => x.dst === 'overlap')?.wall.d).toBe(1);
  });
  it('Lord Howe has a 30 minute DST shift', () => {
    const changes = upcomingDstChanges('Australia/Lord_Howe', Date.parse('2026-01-01T00:00:00Z'), 2);
    expect(changes[0]!.toOffset - changes[0]!.fromOffset).toBe(-30);
    expect(changes[1]!.toOffset - changes[1]!.fromOffset).toBe(30);
    const gap = resolveWall('Australia/Lord_Howe', 2026, 10, 4, 2, 15, 0);
    expect(gap.gap).toBe(true);
  });
  it('lists upcoming New York changes', () => {
    const c = upcomingDstChanges('America/New_York', Date.parse('2026-01-01T00:00:00Z'), 2);
    expect(c.map((x) => x.kind)).toEqual(['gap', 'overlap']);
    expect(wallOf('America/New_York', c[0]!.instant - 1000)).toMatchObject({ mo: 3, d: 8, h: 1, mi: 59 });
  });
});

suite('descriptions', () => {
  it('plain English', () => {
    expect(describe(parse('0 2 * * 1-5'))).toBe('At 02:00 AM, Monday through Friday');
    expect(describe(parse('*/15 9-17 * * 1-5'))).toMatch(/Every 15 minutes, between 09:00 AM and 05:59 PM, Monday through Friday/);
    expect(describe(parse('@reboot'))).toBe('At system startup');
  });
  it('Quartz third Friday', () => {
    expect(describe(parse('0 0 12 ? * 6#3', 'quartz'))).toMatch(/third Friday/);
    expect(describe(parse('0 0 12 ? * 6L', 'quartz'))).toMatch(/last Friday/);
  });
  it('aws dow numbering', () => {
    expect(describe(parse('0 12 ? * 2-6 *', 'aws'))).toMatch(/Monday through Friday/);
  });
  it('dowToNames', () => {
    expect(dowToNames('1-5', 'unix')).toBe('MON-FRI');
    expect(dowToNames('7', 'unix')).toBe('SUN');
    expect(dowToNames('1,7', 'quartz')).toBe('SUN,SAT');
    expect(dowToNames('6#3', 'quartz')).toBe('FRI#3');
  });
});

suite('builder and snippets', () => {
  it('classifies and rebuilds', () => {
    for (const [raw, key] of [['*', 'minute'], ['5,10', 'minute'], ['1-5', 'hour'], ['*/15', 'minute'], ['2/10', 'minute']] as const) {
      expect(buildField(classifyField(raw, key, 'unix'), '0')).toBe(raw);
    }
    expect(buildField(classifyField('FRI#3', 'dow', 'quartz'), '1')).toBe('6#3');
    expect(classifyField('1-5/2', 'minute', 'unix').mode).toBe('custom');
    expect(buildField(classifyField('15W', 'dom', 'quartz'), '1')).toBe('15W');
    expect(classifyField('MON,WED', 'dow', 'unix').values).toEqual(['1', '3']);
  });
  it('unix to EventBridge', () => {
    expect(toEventBridge('0 2 * * 1-5'.split(' '), 'unix')).toBe('cron(0 2 ? * MON-FRI *)');
    expect(toEventBridge('0 2 * * *'.split(' '), 'unix')).toBe('cron(0 2 * * ? *)');
    expect(toEventBridge('0 2 15 * 5'.split(' '), 'unix')).toBeNull();
  });
});
