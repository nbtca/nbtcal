import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { FeedParseError } from './types.js';
import { TIMED_ICS, MIXED_ICS, MALFORMED_ICS } from './__tests__/fixtures.js';

describe('parseCalendar', () => {
  it('returns one vevent for a single-event feed', () => {
    const parsed = parseCalendar(TIMED_ICS);
    expect(parsed.vevents).toHaveLength(1);
    expect(parsed.vevents[0].uid).toBe('timed-1');
  });

  it('returns all vevents for a multi-event feed', () => {
    const parsed = parseCalendar(MIXED_ICS);
    expect(parsed.vevents.map((e) => e.uid).sort()).toEqual(['timed-1', 'timed-2', 'weekly-1']);
  });

  it('throws FeedParseError on malformed input', () => {
    expect(() => parseCalendar(MALFORMED_ICS)).toThrow(FeedParseError);
  });
});
