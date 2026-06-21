import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCalendar } from './parse.js';
import { past } from './query.js';
import { PAST_ICS, WEEKLY_ICS } from './__tests__/fixtures.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('past', () => {
  it('returns events within the default 30-day window', () => {
    const parsed = parseCalendar(PAST_ICS);
    const events = past(parsed);
    // now=2026-06-01, start=2026-05-02; both May-28 and May-30 are in range
    expect(events).toHaveLength(2);
  });

  it('respects a custom day count', () => {
    const parsed = parseCalendar(PAST_ICS);
    const events = past(parsed, { days: 3 });
    // start=2026-05-29; only May-30 qualifies
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe('past-2');
  });

  it('returns events sorted ascending (oldest first)', () => {
    const parsed = parseCalendar(PAST_ICS);
    const events = past(parsed);
    expect(events[0]?.uid).toBe('past-1');
    expect(events[1]?.uid).toBe('past-2');
  });

  it('returns empty when no events fall in the window', () => {
    const parsed = parseCalendar(PAST_ICS);
    const events = past(parsed, { days: 1 });
    // start=2026-05-31; both events are before that
    expect(events).toHaveLength(0);
  });

  it('excludes future recurring occurrences', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    // WEEKLY_ICS starts 2026-06-01; now=2026-06-01T00:00Z, so the first
    // occurrence at 12:00Z is still in the future → past(30) returns 0
    const events = past(parsed, { days: 30 });
    expect(events).toHaveLength(0);
  });
});
