import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { FeedParseError } from './types.js';
import { TIMED_ICS, MIXED_ICS, MALFORMED_ICS } from './__tests__/fixtures.js';

describe('parseCalendar', () => {
  it('returns one vevent for a single-event feed', () => {
    const parsed = parseCalendar(TIMED_ICS);
    expect(parsed.vevents).toHaveLength(1);
    expect(parsed.vevents[0]!.uid).toBe('timed-1');
  });

  it('returns all vevents for a multi-event feed', () => {
    const parsed = parseCalendar(MIXED_ICS);
    expect(parsed.vevents.map((e) => e.uid).sort()).toEqual(['timed-1', 'timed-2', 'weekly-1']);
  });

  it('throws FeedParseError on malformed input', () => {
    expect(() => parseCalendar(MALFORMED_ICS)).toThrow(FeedParseError);
  });

  it.each(['', '   \r\n\t'])('throws FeedParseError on empty input', (input) => {
    expect(() => parseCalendar(input)).toThrow(FeedParseError);
  });

  it('throws FeedParseError when a regular event has no start', () => {
    const input = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:missing-start
SUMMARY:Missing start
END:VEVENT
END:VCALENDAR`;
    expect(() => parseCalendar(input)).toThrow(FeedParseError);
  });

  it('throws FeedParseError when an event has no uid', () => {
    const input = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Missing uid
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
END:VEVENT
END:VCALENDAR`;
    expect(() => parseCalendar(input)).toThrow(FeedParseError);
  });
});
