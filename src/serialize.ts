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

/** RFC 5545 §3.1 content-line folding: split at 75 octets, continuations begin with a space. */
function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf-8') <= 75) return line;
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf-8');
    // first physical line has 75 octets of budget; continuations reserve 1 for the leading space
    const budget = chunks.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > budget) {
      chunks.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n ');
}

export function eventToICS(event: CalendarEvent, options: EventToICSOptions = {}): string {
  const prodId = options.prodId ?? DEFAULT_PRODID;
  const now = options.now ?? new Date();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${escapeText(prodId)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
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

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
