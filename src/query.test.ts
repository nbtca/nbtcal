import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { occurrencesInRange } from './query.js';
import { TIMED_ICS, ALLDAY_ICS, WEEKLY_ICS } from './__tests__/fixtures.js';

const D = (iso: string) => new Date(iso);

const MOVED_OCCURRENCE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:moved-series
SUMMARY:Weekly meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:moved-series
RECURRENCE-ID:20260608T120000Z
SUMMARY:Moved weekly meeting
DTSTART:20260609T150000Z
DTEND:20260609T160000Z
END:VEVENT
END:VCALENDAR`;

const UNRELATED_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-a
SUMMARY:Series A
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=2
END:VEVENT
BEGIN:VEVENT
UID:series-b
RECURRENCE-ID:20260608T120000Z
SUMMARY:Standalone B
DTSTART:20260609T150000Z
DTEND:20260609T160000Z
END:VEVENT
END:VCALENDAR`;

const CANCELLED_OCCURRENCE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:cancelled-series
SUMMARY:Weekly meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:cancelled-series
RECURRENCE-ID:20260608T120000Z
DTSTART:20260608T120000Z
DTEND:20260608T130000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

const MINIMAL_CANCELLED_OCCURRENCE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:minimal-cancelled-series
SUMMARY:Weekly meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:minimal-cancelled-series
RECURRENCE-ID:20260608T120000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

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

  it('includes the start boundary and excludes the end boundary', () => {
    const parsed = parseCalendar(TIMED_ICS);
    const before = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-20T09:00:00Z'));
    const after = occurrencesInRange(parsed, D('2026-06-20T09:00:00Z'), D('2026-06-21T00:00:00Z'));
    expect(before).toHaveLength(0);
    expect(after.map((event) => event.uid)).toEqual(['timed-1']);
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

  it('excludes a recurring occurrence at the end boundary', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T12:00:00Z'), D('2026-06-15T12:00:00Z'));
    expect(events.map((event) => event.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-08T12:00:00.000Z',
    ]);
  });

  it('emits a moved recurrence once instead of also treating its exception as a standalone event', () => {
    const parsed = parseCalendar(MOVED_OCCURRENCE_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events.map((event) => event.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-09T15:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
    ]);
  });

  it('uses the moved recurrence metadata instead of the series metadata', () => {
    const parsed = parseCalendar(MOVED_OCCURRENCE_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-09T00:00:00Z'), D('2026-06-10T00:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Moved weekly meeting', recurring: true });
  });

  it('does not attach an exception to a recurrence with a different uid', () => {
    const parsed = parseCalendar(UNRELATED_EXCEPTION_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events.map(({ uid, title, start }) => ({ uid, title, start: start.toISOString() }))).toEqual([
      { uid: 'series-a', title: 'Series A', start: '2026-06-01T12:00:00.000Z' },
      { uid: 'series-a', title: 'Series A', start: '2026-06-08T12:00:00.000Z' },
      { uid: 'series-b', title: 'Standalone B', start: '2026-06-09T15:00:00.000Z' },
    ]);
  });

  it('omits a cancelled recurrence occurrence', () => {
    const parsed = parseCalendar(CANCELLED_OCCURRENCE_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events.map((event) => event.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
    ]);
  });

  it('omits a cancelled recurrence that has no DTSTART', () => {
    const parsed = parseCalendar(MINIMAL_CANCELLED_OCCURRENCE_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events.map((event) => event.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
    ]);
  });

  it('returns occurrences sorted ascending by start', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-08-01T00:00:00Z'));
    const times = events.map((e) => e.start.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it.each([
    [new Date(Number.NaN), D('2026-06-30T00:00:00Z')],
    [D('2026-06-01T00:00:00Z'), new Date(Number.NaN)],
  ])('rejects an invalid range boundary before recurrence expansion', (start, end) => {
    const parsed = parseCalendar(WEEKLY_ICS);
    expect(() => occurrencesInRange(parsed, start, end)).toThrow(RangeError);
  });

  it('rejects a reversed range', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    expect(() => occurrencesInRange(
      parsed,
      D('2026-06-30T00:00:00Z'),
      D('2026-06-01T00:00:00Z'),
    )).toThrow(RangeError);
  });
});
