import { TimetableError, type Weekday } from './types.js';

const DAY_MS = 86_400_000;
const CAMPUS_OFFSET_HOURS = 8;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export const CAMPUS_TIME_ZONE = 'Asia/Shanghai';

export interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

export interface ClockTimeParts {
  hour: number;
  minute: number;
}

export function parseIsoDate(value: string): IsoDateParts | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function parseClockTime(value: string): ClockTimeParts | null {
  const match = TIME_PATTERN.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

function requireIsoDate(value: string): IsoDateParts {
  const parts = parseIsoDate(value);
  if (!parts) {
    throw new TimetableError('MISSING_CALENDAR_DATES', 'The timetable date is invalid.');
  }
  return parts;
}

export function isoDateIndex(value: string): number {
  const parts = requireIsoDate(value);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
}

export function addIsoDays(value: string, days: number): string {
  const parts = requireIsoDate(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function isoWeekday(value: string): Weekday {
  const parts = requireIsoDate(value);
  return (((new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7) +
    1) as Weekday;
}

export function validateWeekOneMonday(value: string): void {
  if (!parseIsoDate(value) || isoWeekday(value) !== 1) {
    throw new TimetableError('MISSING_CALENDAR_DATES', 'weekOneMonday must be a valid Monday.');
  }
}

export function campusIsoDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new TypeError('date must be valid.');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: CAMPUS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function campusDateTime(date: string, time: string): Date {
  const dateParts = requireIsoDate(date);
  const timeParts = parseClockTime(time);
  if (!timeParts) {
    throw new TimetableError('MISSING_PERIOD_TIME', 'A timetable period contains an invalid time.');
  }
  return new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hour - CAMPUS_OFFSET_HOURS,
      timeParts.minute,
    ),
  );
}
