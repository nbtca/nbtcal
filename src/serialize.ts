import type { CalendarEvent } from './types.js';

const DEFAULT_PRODID = '-//nbtca//nbtcal//EN';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function assertValidDate(date: Date, name: string): void {
  if (!Number.isFinite(date.getTime())) throw new RangeError(`${name} must be a valid Date`);
}

/** Timed datetime in UTC: YYYYMMDDTHHMMSSZ */
function formatUTC(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function isUtcCivilProxy(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

function formatDate(date: Date, utcCivil: boolean): string {
  const year = utcCivil ? date.getUTCFullYear() : date.getFullYear();
  const month = (utcCivil ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = utcCivil ? date.getUTCDate() : date.getDate();
  return `${year}${pad(month)}${pad(day)}`;
}

function nextCivilDay(date: Date, utcCivil: boolean): Date {
  const out = new Date(date);
  if (utcCivil) out.setUTCDate(out.getUTCDate() + 1);
  else out.setDate(out.getDate() + 1);
  return out;
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
  assertValidDate(event.start, 'event.start');
  if (event.end) assertValidDate(event.end, 'event.end');
  assertValidDate(now, 'options.now');

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
    // Query APIs use UTC midnight as a host-independent civil-date proxy. Keep
    // accepting caller-created local-midnight values for backwards compatibility.
    const utcCivil = isUtcCivilProxy(event.start);
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.start, utcCivil)}`);
    const end = event.end ?? nextCivilDay(event.start, utcCivil);
    lines.push(`DTEND;VALUE=DATE:${formatDate(end, isUtcCivilProxy(end))}`);
  } else {
    lines.push(`DTSTART:${formatUTC(event.start)}`);
    if (event.end) lines.push(`DTEND:${formatUTC(event.end)}`);
  }

  if (event.title !== null) lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location !== null) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description !== null) lines.push(`DESCRIPTION:${escapeText(event.description)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
