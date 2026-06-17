import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { heatmap } from './query.js';
import { MIXED_ICS } from './__tests__/fixtures.js';

const D = (iso: string) => new Date(iso);

describe('heatmap (day buckets)', () => {
  it('is dense: every day in range is present, including zeros', () => {
    const parsed = parseCalendar(MIXED_ICS);
    const buckets = heatmap(parsed, { start: D('2026-06-19T00:00:00Z'), end: D('2026-06-21T00:00:00Z') });
    expect(buckets.map((b) => b.date)).toEqual(['2026-06-19', '2026-06-20', '2026-06-21']);
  });

  it('counts multiple events on the same day', () => {
    const parsed = parseCalendar(MIXED_ICS);
    const buckets = heatmap(parsed, { start: D('2026-06-19T00:00:00Z'), end: D('2026-06-21T00:00:00Z') });
    const byDate = Object.fromEntries(buckets.map((b) => [b.date, b.count]));
    // timed-1 (09:00) and timed-2 (14:00) both on 06-20.
    expect(byDate['2026-06-20']).toBe(2);
    expect(byDate['2026-06-19']).toBe(0);
    expect(byDate['2026-06-21']).toBe(0);
  });

  it('counts recurring occurrences', () => {
    const parsed = parseCalendar(MIXED_ICS);
    // 2026-06-08 is a weekly-meeting occurrence and nothing else.
    const buckets = heatmap(parsed, { start: D('2026-06-08T00:00:00Z'), end: D('2026-06-08T00:00:00Z') });
    expect(buckets).toEqual([{ date: '2026-06-08', count: 1 }]);
  });
});

describe('heatmap timezone', () => {
  // 2026-06-19T17:00Z == 2026-06-20T01:00 in Asia/Shanghai, but still 06-19 in UTC.
  const BOUNDARY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//nbtca//test//EN
BEGIN:VEVENT
UID:boundary-1
SUMMARY:Late Night
DTSTART:20260619T170000Z
DTEND:20260619T180000Z
END:VEVENT
END:VCALENDAR`;

  it('buckets by Asia/Shanghai by default (after 16:00 UTC counts as next day)', () => {
    const parsed = parseCalendar(BOUNDARY_ICS);
    const buckets = heatmap(parsed, { start: D('2026-06-20T00:00:00Z'), end: D('2026-06-20T00:00:00Z') });
    expect(buckets).toEqual([{ date: '2026-06-20', count: 1 }]);
  });

  it('honors a timeZone override', () => {
    const parsed = parseCalendar(BOUNDARY_ICS);
    const buckets = heatmap(parsed, {
      start: D('2026-06-19T00:00:00Z'),
      end: D('2026-06-19T00:00:00Z'),
      timeZone: 'UTC',
    });
    expect(buckets).toEqual([{ date: '2026-06-19', count: 1 }]);
  });
});

describe('heatmap (week buckets)', () => {
  it('buckets by ISO week start (Monday) and is dense', () => {
    const parsed = parseCalendar(MIXED_ICS);
    const buckets = heatmap(parsed, {
      start: D('2026-06-01T00:00:00Z'),
      end: D('2026-06-21T00:00:00Z'),
      bucket: 'week',
    });
    // Weeks starting Mon 06-01, 06-08, 06-15.
    expect(buckets.map((b) => b.date)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
    const byDate = Object.fromEntries(buckets.map((b) => [b.date, b.count]));
    // Week of 06-15 contains timed-1, timed-2 (06-20) and the weekly meeting (06-15) = 3.
    expect(byDate['2026-06-15']).toBe(3);
  });
});
