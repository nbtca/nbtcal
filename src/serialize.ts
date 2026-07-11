import type { CalendarEvent } from './types.js';

const DEFAULT_PRODID = '-//nbtca//nbtcal//EN';
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Timed datetime in UTC: YYYYMMDDTHHMMSSZ */
function formatUTC(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** All-day date in UTC components: YYYYMMDD */
function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** RFC 5545 §3.3.11 text escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

export interface EventToICSOptions {
  prodId?: string;
  now?: Date;
}

export function eventToICS(event: CalendarEvent, options: EventToICSOptions = {}): string {
  const prodId = options.prodId ?? DEFAULT_PRODID;
  const now = options.now ?? new Date();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatUTC(now)}`,
  ];

  if (event.isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.start)}`);
    const end = event.end ?? new Date(event.start.getTime() + DAY_MS);
    lines.push(`DTEND;VALUE=DATE:${formatDate(end)}`);
  } else {
    lines.push(`DTSTART:${formatUTC(event.start)}`);
    if (event.end) lines.push(`DTEND:${formatUTC(event.end)}`);
  }

  if (event.title != null) lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location != null) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description != null) lines.push(`DESCRIPTION:${escapeText(event.description)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}
