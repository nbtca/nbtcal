import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCalendar } from './parse.js';
import { upcoming, next } from './query.js';
import { WEEKLY_ICS } from './__tests__/fixtures.js';

beforeEach(() => {
  vi.useFakeTimers();
  // Pretend "now" is just before the first weekly occurrence.
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('upcoming', () => {
  it('returns occurrences within the default 30-day window', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = upcoming(parsed);
    // 2026-06-01..2026-07-01 covers occurrences on 06-01,08,15,22,29 = 5.
    expect(events).toHaveLength(5);
  });

  it('respects a custom day count', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = upcoming(parsed, { days: 14 });
    // 2026-06-01..2026-06-15 covers 06-01, 06-08, 06-15 = 3.
    expect(events).toHaveLength(3);
  });
});

describe('next', () => {
  it('returns the next N occurrences', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = next(parsed, 2);
    expect(events.map((e) => e.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-08T12:00:00.000Z',
    ]);
  });

  it('returns fewer than N when not enough remain', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = next(parsed, 100);
    expect(events).toHaveLength(8); // RRULE COUNT=8
  });
});
