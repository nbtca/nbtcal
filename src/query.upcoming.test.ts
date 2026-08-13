import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCalendar } from './parse.js';
import { occurrencesInRange, upcoming, next } from './query.js';
import { WEEKLY_ICS } from './__tests__/fixtures.js';

const POSTPONED_FIRST_OCCURRENCE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:postponed-series
SUMMARY:Weekly meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:postponed-series
RECURRENCE-ID:20260601T120000Z
SUMMARY:Postponed weekly meeting
DTSTART:20260620T120000Z
DTEND:20260620T130000Z
END:VEVENT
END:VCALENDAR`;

const ADVANCED_LATER_OCCURRENCE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:advanced-series
SUMMARY:Weekly meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:advanced-series
RECURRENCE-ID:20260615T120000Z
SUMMARY:Advanced weekly meeting
DTSTART:20260602T120000Z
DTEND:20260602T130000Z
END:VEVENT
END:VCALENDAR`;

const FAR_ADVANCED_HIGH_FREQUENCY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:high-frequency-series
SUMMARY:High-frequency meeting
DTSTART:20260601T000010Z
DTEND:20260601T000011Z
RRULE:FREQ=SECONDLY;COUNT=86401
END:VEVENT
BEGIN:VEVENT
UID:high-frequency-series
RECURRENCE-ID:20260602T000000Z
SUMMARY:Far advanced meeting
DTSTART:20260601T000001Z
DTEND:20260601T000002Z
END:VEVENT
END:VCALENDAR`;

const HIGH_FREQUENCY_HISTORY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:high-frequency-history
SUMMARY:High-frequency history
DTSTART:20260531T000000Z
DTEND:20260531T000001Z
RRULE:FREQ=SECONDLY;COUNT=86402
END:VEVENT
END:VCALENDAR`;

const FIXED_INTERVAL_EXCEPTION_SEMANTICS_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:fixed-exception-semantics
SUMMARY:Regular occurrence
DTSTART:20260601T000010Z
DTEND:20260601T000011Z
RRULE:FREQ=SECONDLY;INTERVAL=10;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:fixed-exception-semantics
RECURRENCE-ID:20260601T000010Z
SUMMARY:Postponed occurrence
DTSTART:20260601T000035Z
DTEND:20260601T000037Z
END:VEVENT
BEGIN:VEVENT
UID:fixed-exception-semantics
RECURRENCE-ID:20260601T000030Z
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:fixed-exception-semantics
RECURRENCE-ID:20260601T000040Z
SUMMARY:Advanced occurrence
DTSTART:20260601T000020Z
DTEND:20260601T000023Z
END:VEVENT
END:VCALENDAR`;

const FIXED_INTERVAL_BOUNDARIES_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:fixed-boundaries
SUMMARY:Boundary occurrence
DTSTART:20260531T235958Z
DTEND:20260601T000003Z
RRULE:FREQ=SECONDLY;UNTIL=20260601T000000Z
END:VEVENT
END:VCALENDAR`;

const NEXT_HORIZON_BOUNDARY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:horizon-boundary
SUMMARY:At the exclusive horizon
DTSTART:20270601T000000Z
DTEND:20270601T010000Z
RRULE:FREQ=HOURLY;COUNT=1
END:VEVENT
END:VCALENDAR`;

const THIS_AND_FUTURE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:range-series
SUMMARY:Weekly meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:range-series
RECURRENCE-ID;RANGE=THISANDFUTURE:20260608T120000Z
SUMMARY:Shifted weekly meeting
DTSTART:20260610T150000Z
DTEND:20260610T160000Z
END:VEVENT
END:VCALENDAR`;

const ORPHAN_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:orphan-series
SUMMARY:Weekly meeting
DTSTART:20260901T120000Z
DTEND:20260901T130000Z
RRULE:FREQ=WEEKLY;COUNT=2
END:VEVENT
BEGIN:VEVENT
UID:orphan-series
RECURRENCE-ID:20271201T120000Z
SUMMARY:Orphan exception
DTSTART:20260902T120000Z
DTEND:20260902T130000Z
END:VEVENT
END:VCALENDAR`;

const EXCLUDED_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:excluded-series
SUMMARY:Hourly meeting
DTSTART:20260901T120000Z
DTEND:20260901T123000Z
RRULE:FREQ=HOURLY;COUNT=3
EXDATE:20260901T130000Z
END:VEVENT
BEGIN:VEVENT
UID:excluded-series
RECURRENCE-ID:20260901T130000Z
SUMMARY:Excluded exception
DTSTART:20260901T121500Z
DTEND:20260901T124500Z
END:VEVENT
END:VCALENDAR`;

const MISALIGNED_HIGH_FREQUENCY_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:misaligned-high-frequency
SUMMARY:Every two seconds
DTSTART:20260531T000000Z
DTEND:20260531T000001Z
RRULE:FREQ=SECONDLY;INTERVAL=2
END:VEVENT
BEGIN:VEVENT
UID:misaligned-high-frequency
RECURRENCE-ID:20260602T000001Z
SUMMARY:Misaligned orphan
DTSTART:20260601T000001Z
DTEND:20260601T000002Z
END:VEVENT
END:VCALENDAR`;

const CUSTOM_UTC_TRANSITION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:UTC
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20260601T010000
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
RDATE:20260601T010000
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:custom-utc-transition
SUMMARY:Custom UTC transition
DTSTART;TZID=UTC:20260601T000000
DTEND;TZID=UTC:20260601T003000
RRULE:FREQ=HOURLY;COUNT=4
END:VEVENT
END:VCALENDAR`;

const CUSTOM_UTC_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:UTC
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0100
TZOFFSETTO:+0100
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:custom-utc-exception
SUMMARY:Regular occurrence
DTSTART:20260901T120000Z
DTEND:20260901T123000Z
RRULE:FREQ=HOURLY;COUNT=2
END:VEVENT
BEGIN:VEVENT
UID:custom-utc-exception
RECURRENCE-ID;TZID=UTC:20260901T130000
SUMMARY:Custom-zone impostor
DTSTART:20260902T120000Z
DTEND:20260902T123000Z
END:VEVENT
END:VCALENDAR`;

const RANGE_DST_BACKWARD_SHIFT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:SHIFT
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20260308T020000
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
RDATE:20260308T020000
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:range-dst-backward-shift
SUMMARY:Weekly meeting
DTSTART:20260301T120000Z
DTEND:20260301T130000Z
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:range-dst-backward-shift
RECURRENCE-ID;RANGE=THISANDFUTURE:20260301T120000Z
SUMMARY:Shifted weekly meeting
DTSTART;TZID=SHIFT:20260228T120000
DTEND;TZID=SHIFT:20260228T130000
END:VEVENT
END:VCALENDAR`;

const RANGE_FLOATING_BACKWARD_SHIFT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:range-floating-backward-shift
SUMMARY:Floating weekly meeting
DTSTART:20260301T120000
DTEND:20260301T130000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:range-floating-backward-shift
RECURRENCE-ID;RANGE=THISANDFUTURE:20260301T120000
SUMMARY:Shifted floating weekly meeting
DTSTART:20260228T120000
DTEND:20260228T130000
END:VEVENT
END:VCALENDAR`;

const RANGE_MISMATCHED_TZID_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:MASTER
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20260308T020000
TZOFFSETFROM:+0000
TZOFFSETTO:-0100
RDATE:20260308T020000
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VTIMEZONE
TZID:RID
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:range-mismatched-tzid
SUMMARY:Weekly meeting
DTSTART;TZID=MASTER:20260301T120000
DTEND;TZID=MASTER:20260301T130000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:range-mismatched-tzid
RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=RID:20260301T120000
SUMMARY:Shifted weekly meeting
DTSTART;TZID=RID:20260228T120000
DTEND;TZID=RID:20260228T130000
END:VEVENT
END:VCALENDAR`;

const MISALIGNED_DAILY_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:misaligned-daily
SUMMARY:Daily meeting
DTSTART:20260531T000000Z
DTEND:20260531T000001Z
RRULE:FREQ=DAILY
END:VEVENT
BEGIN:VEVENT
UID:misaligned-daily
RECURRENCE-ID:21000101T000001Z
SUMMARY:Misaligned orphan
DTSTART:20260601T000001Z
DTEND:20260601T000002Z
END:VEVENT
END:VCALENDAR`;

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
    // Rolling 14x24h window 2026-06-01T00:00Z..2026-06-15T00:00Z covers
    // 06-01 and 06-08 (the 06-15T12:00 occurrence falls just past the end).
    expect(events).toHaveLength(2);
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

  it('orders rescheduled occurrences by their actual start before applying the limit', () => {
    const parsed = parseCalendar(POSTPONED_FIRST_OCCURRENCE_ICS);

    expect(next(parsed, 1).map((event) => event.start.toISOString())).toEqual([
      '2026-06-08T12:00:00.000Z',
    ]);
  });

  it('keeps scanning when a later recurrence can be moved before the current selection', () => {
    const parsed = parseCalendar(ADVANCED_LATER_OCCURRENCE_ICS);

    expect(next(parsed, 2).map((event) => event.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-02T12:00:00.000Z',
    ]);
  });

  it('does not scan every recurrence before a far advanced exception', () => {
    const parsed = parseCalendar(FAR_ADVANCED_HIGH_FREQUENCY_ICS);
    const event = parsed.vevents[0]!;
    const iterator = event.iterator();
    const nextOccurrence = iterator.next.bind(iterator);
    const nextSpy = vi.spyOn(iterator, 'next').mockImplementation(nextOccurrence);
    vi.spyOn(event, 'iterator').mockReturnValue(iterator);

    expect(next(parsed, 1).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-06-01T00:00:01.000Z',
    ]);
    expect(nextSpy.mock.calls.length).toBeLessThan(10);
  });

  it('does not scan fixed-interval recurrence history before the query start', () => {
    const parsed = parseCalendar(HIGH_FREQUENCY_HISTORY_ICS);
    const event = parsed.vevents[0]!;
    const iterator = event.iterator();
    const nextOccurrence = iterator.next.bind(iterator);
    const nextSpy = vi.spyOn(iterator, 'next').mockImplementation(nextOccurrence);
    vi.spyOn(event, 'iterator').mockReturnValue(iterator);

    expect(next(parsed, 1).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-06-01T00:00:00.000Z',
    ]);
    expect(nextSpy.mock.calls.length).toBeLessThan(10);
  });

  it('handles direct exception cancellation, moves, and ties in the arithmetic path', () => {
    const parsed = parseCalendar(FIXED_INTERVAL_EXCEPTION_SEMANTICS_ICS);

    expect(
      next(parsed, 10).map(({ title, start, end }) => ({
        title,
        start: start.toISOString(),
        end: end?.toISOString(),
      })),
    ).toEqual([
      {
        title: 'Regular occurrence',
        start: '2026-06-01T00:00:20.000Z',
        end: '2026-06-01T00:00:21.000Z',
      },
      {
        title: 'Advanced occurrence',
        start: '2026-06-01T00:00:20.000Z',
        end: '2026-06-01T00:00:23.000Z',
      },
      {
        title: 'Postponed occurrence',
        start: '2026-06-01T00:00:35.000Z',
        end: '2026-06-01T00:00:37.000Z',
      },
    ]);
  });

  it('includes the query start and UNTIL while preserving the recurring duration', () => {
    const parsed = parseCalendar(FIXED_INTERVAL_BOUNDARIES_ICS);

    expect(
      next(parsed, 10).map(({ start, end }) => [start.toISOString(), end?.toISOString()]),
    ).toEqual([['2026-06-01T00:00:00.000Z', '2026-06-01T00:00:05.000Z']]);
  });

  it('excludes a fixed-interval occurrence at the one-year horizon', () => {
    expect(next(parseCalendar(NEXT_HORIZON_BOUNDARY_ICS), 1)).toEqual([]);
  });

  it('preserves RANGE=THISANDFUTURE shifts for later occurrences', () => {
    const parsed = parseCalendar(THIS_AND_FUTURE_ICS);

    expect(next(parsed, 4).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-10T15:00:00.000Z',
      '2026-06-17T15:00:00.000Z',
      '2026-06-24T15:00:00.000Z',
    ]);
  });

  it('does not emit an exception whose recurrence id is outside the recurrence set', () => {
    vi.setSystemTime(new Date('2026-08-13T00:00:00Z'));
    const parsed = parseCalendar(ORPHAN_EXCEPTION_ICS);

    expect(next(parsed, 10).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-09-01T12:00:00.000Z',
      '2026-09-08T12:00:00.000Z',
    ]);
  });

  it('does not reintroduce an EXDATE through a conflicting exception', () => {
    vi.setSystemTime(new Date('2026-08-13T00:00:00Z'));
    const parsed = parseCalendar(EXCLUDED_EXCEPTION_ICS);

    expect(next(parsed, 10).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-09-01T12:00:00.000Z',
      '2026-09-01T14:00:00.000Z',
    ]);
  });

  it('ignores a proven fixed-interval orphan without scanning toward its remote id', () => {
    const parsed = parseCalendar(MISALIGNED_HIGH_FREQUENCY_EXCEPTION_ICS);
    const event = parsed.vevents[0]!;
    const iterator = event.iterator();
    const nextOccurrence = iterator.next.bind(iterator);
    const nextSpy = vi.spyOn(iterator, 'next').mockImplementation(nextOccurrence);
    vi.spyOn(event, 'iterator').mockReturnValue(iterator);

    expect(next(parsed, 1).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-06-01T00:00:00.000Z',
    ]);
    expect(nextSpy.mock.calls.length).toBeLessThan(10);
  });

  it('does not use UTC arithmetic for a custom VTIMEZONE whose TZID is UTC', () => {
    const parsed = parseCalendar(CUSTOM_UTC_TRANSITION_ICS);

    expect(next(parsed, 10).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-06-01T00:00:00.000Z',
      '2026-06-01T01:00:00.000Z',
      '2026-06-01T02:00:00.000Z',
    ]);
  });

  it('does not treat a custom VTIMEZONE recurrence id as built-in UTC', () => {
    vi.setSystemTime(new Date('2026-08-13T00:00:00Z'));
    const parsed = parseCalendar(CUSTOM_UTC_EXCEPTION_ICS);

    expect(next(parsed, 10).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-09-01T12:00:00.000Z',
      '2026-09-01T13:00:00.000Z',
    ]);
  });

  it('does not let a proven DAILY orphan extend fallback expansion to its remote id', () => {
    const parsed = parseCalendar(MISALIGNED_DAILY_EXCEPTION_ICS);
    const event = parsed.vevents[0]!;
    const iterator = event.iterator();
    const nextOccurrence = iterator.next.bind(iterator);
    const nextSpy = vi.spyOn(iterator, 'next').mockImplementation(nextOccurrence);
    vi.spyOn(event, 'iterator').mockReturnValue(iterator);

    expect(next(parsed, 1).map((occurrence) => occurrence.start.toISOString())).toEqual([
      '2026-06-01T00:00:00.000Z',
    ]);
    expect(nextSpy.mock.calls.length).toBeLessThan(10);
  });

  it('stops expanding each recurrence after enough occurrences are collected', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const iterator = parsed.vevents[0]!.iterator();
    const nextOccurrence = iterator.next.bind(iterator);
    const nextSpy = vi.spyOn(iterator, 'next').mockImplementation(nextOccurrence);
    vi.spyOn(parsed.vevents[0]!, 'iterator').mockReturnValue(iterator);
    expect(next(parsed, 2)).toHaveLength(2);
    expect(nextSpy).toHaveBeenCalledTimes(2);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid occurrence count: %s',
    (count) => {
      const parsed = parseCalendar(WEEKLY_ICS);
      expect(() => next(parsed, count)).toThrow(RangeError);
    },
  );
});

describe('RANGE=THISANDFUTURE boundaries', () => {
  it('accounts for a later offset transition when a range shift moves an occurrence backward', () => {
    const parsed = parseCalendar(RANGE_DST_BACKWARD_SHIFT_ICS);

    expect(
      occurrencesInRange(
        parsed,
        new Date('2026-03-14T10:30:00Z'),
        new Date('2026-03-14T11:30:00Z'),
      ).map((occurrence) => occurrence.start.toISOString()),
    ).toEqual(['2026-03-14T11:00:00.000Z']);
  });

  it('uses a conservative horizon for floating range exceptions across host DST', () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      const parsed = parseCalendar(RANGE_FLOATING_BACKWARD_SHIFT_ICS);

      expect(
        occurrencesInRange(
          parsed,
          new Date('2026-03-14T18:30:00Z'),
          new Date('2026-03-14T19:30:00Z'),
        ).map((occurrence) => occurrence.start.toISOString()),
      ).toEqual(['2026-03-14T19:00:00.000Z']);
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it('uses the master recurrence zone when a malformed RANGE exception has another TZID', () => {
    const parsed = parseCalendar(RANGE_MISMATCHED_TZID_ICS);

    expect(
      occurrencesInRange(
        parsed,
        new Date('2026-03-14T11:30:00Z'),
        new Date('2026-03-14T12:30:00Z'),
      ).map((occurrence) => occurrence.start.toISOString()),
    ).toEqual(['2026-03-14T12:00:00.000Z']);
  });
});
