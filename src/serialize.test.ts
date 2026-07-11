import { describe, it, expect } from 'vitest';
import { eventToICS } from './serialize.js';
import type { CalendarEvent } from './types.js';

const base: CalendarEvent = {
  uid: 'evt-1',
  title: 'Hack Night',
  start: new Date('2026-03-25T12:30:00Z'),
  end: new Date('2026-03-25T14:00:00Z'),
  isAllDay: false,
  location: 'Lab 101',
  description: 'Bring laptops',
  recurring: false,
};
const now = new Date('2026-03-01T00:00:00Z');

describe('eventToICS', () => {
  it('wraps a valid VCALENDAR/VEVENT envelope ending in CRLF', () => {
    const ics = eventToICS(base, { now });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//nbtca//nbtcal//EN');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:evt-1');
    expect(ics).toContain('DTSTAMP:20260301T000000Z');
    expect(ics).toContain('END:VEVENT');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('formats a timed event start/end in UTC and includes text props', () => {
    const ics = eventToICS(base, { now });
    expect(ics).toContain('DTSTART:20260325T123000Z');
    expect(ics).toContain('DTEND:20260325T140000Z');
    expect(ics).toContain('SUMMARY:Hack Night');
    expect(ics).toContain('LOCATION:Lab 101');
    expect(ics).toContain('DESCRIPTION:Bring laptops');
  });

  it('omits DTEND when end is null', () => {
    const ics = eventToICS({ ...base, end: null }, { now });
    expect(ics).not.toContain('DTEND');
  });

  it('formats an all-day event with VALUE=DATE and an exclusive next-day end', () => {
    const allDay: CalendarEvent = { ...base, isAllDay: true, start: new Date('2026-03-25T00:00:00Z'), end: null };
    const ics = eventToICS(allDay, { now });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260325');
    expect(ics).toContain('DTEND;VALUE=DATE:20260326');
  });

  it('escapes commas, semicolons, backslashes, and newlines in text', () => {
    const ics = eventToICS({ ...base, title: 'A, B; C\\D', description: 'line1\nline2' }, { now });
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
  });

  it('omits null title/location/description', () => {
    const ics = eventToICS({ ...base, title: null, location: null, description: null }, { now });
    expect(ics).not.toContain('SUMMARY');
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('DESCRIPTION');
  });
});
