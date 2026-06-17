import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { occurrencesInRange } from './query.js';
import { TIMED_ICS, ALLDAY_ICS, WEEKLY_ICS } from './__tests__/fixtures.js';

const D = (iso: string) => new Date(iso);

describe('occurrencesInRange', () => {
  it('maps a timed event to a CalendarEvent', () => {
    const parsed = parseCalendar(TIMED_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: 'timed-1',
      title: 'Repair Day',
      location: 'Lab 301',
      description: 'Bring your laptop',
      isAllDay: false,
      recurring: false,
    });
    expect(events[0].start.toISOString()).toBe('2026-06-20T09:00:00.000Z');
    expect(events[0].end?.toISOString()).toBe('2026-06-20T11:00:00.000Z');
  });

  it('flags all-day events', () => {
    const parsed = parseCalendar(ALLDAY_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0].isAllDay).toBe(true);
    expect(events[0].title).toBe('Recruitment Week');
    expect(events[0].location).toBeNull();
  });

  it('excludes events outside the range', () => {
    const parsed = parseCalendar(TIMED_ICS);
    const events = occurrencesInRange(parsed, D('2026-07-01T00:00:00Z'), D('2026-07-31T00:00:00Z'));
    expect(events).toHaveLength(0);
  });

  it('expands a weekly recurring event within the window', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    // 8 weekly occurrences from 2026-06-01; window covers the first 3.
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-16T00:00:00Z'));
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.recurring)).toBe(true);
    expect(events.map((e) => e.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-08T12:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
    ]);
  });

  it('returns occurrences sorted ascending by start', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-08-01T00:00:00Z'));
    const times = events.map((e) => e.start.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
