import ICAL, { Event as ICalEvent, Time as ICalTime } from 'ical.js';
import type { ParsedCalendar } from './parse.js';
import type { CalendarEvent, UpcomingOptions, HeatmapOptions, HeatmapBucket } from './types.js';

function toCalendarEvent(
  event: ICalEvent,
  startTime: ICalTime,
  endTime: ICalTime | null,
  recurring: boolean,
): CalendarEvent {
  return {
    uid: event.uid,
    title: event.summary || null,
    start: startTime.toJSDate(),
    end: endTime ? endTime.toJSDate() : null,
    isAllDay: Boolean(startTime.isDate),
    location: event.location || null,
    description: event.description || null,
    recurring,
  };
}

function expand(event: ICalEvent, start: Date, end: Date): CalendarEvent[] {
  if (!event.isRecurring()) {
    const occStart = event.startDate.toJSDate();
    if (occStart >= start && occStart <= end) {
      return [toCalendarEvent(event, event.startDate, event.endDate, false)];
    }
    return [];
  }

  // NOTE: Do NOT pass a start Time to event.iterator() — ical.js uses the
  // seed time's date components verbatim, which resets the time-of-day on
  // UTC events (e.g. 12:00Z becomes 00:00Z). Iterate from the beginning and
  // filter in JavaScript instead.
  const out: CalendarEvent[] = [];
  const iterator = event.iterator();
  let next: ICalTime | null;
  while ((next = iterator.next())) {
    const occStart = next.toJSDate();
    if (occStart > end) break;
    if (occStart < start) continue;
    const details = event.getOccurrenceDetails(next);
    out.push(toCalendarEvent(event, details.startDate, details.endDate, true));
  }
  return out;
}

export function occurrencesInRange(parsed: ParsedCalendar, start: Date, end: Date): CalendarEvent[] {
  const events = parsed.vevents.flatMap((e) => expand(e, start, end));
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT_HORIZON_DAYS = 365;

export function upcoming(parsed: ParsedCalendar, options: UpcomingOptions = {}): CalendarEvent[] {
  const days = options.days ?? 30;
  const now = new Date();
  const end = new Date(now.getTime() + days * DAY_MS + (DAY_MS - 1));
  return occurrencesInRange(parsed, now, end);
}

export function next(parsed: ParsedCalendar, count: number): CalendarEvent[] {
  const now = new Date();
  const horizon = new Date(now.getTime() + NEXT_HORIZON_DAYS * DAY_MS);
  return occurrencesInRange(parsed, now, horizon).slice(0, count);
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

export function heatmap(parsed: ParsedCalendar, options: HeatmapOptions): HeatmapBucket[] {
  const bucket = options.bucket ?? 'day';
  // Extend end to the last millisecond of the day so timed events (e.g. 12:00Z)
  // on options.end's calendar date are included when options.end is midnight.
  const endOfDay = new Date(startOfDay(options.end).getTime() + DAY_MS - 1);
  const events = occurrencesInRange(parsed, options.start, endOfDay);

  const counts = new Map<string, number>();
  for (const event of events) {
    const key = bucket === 'week' ? dateKey(startOfWeek(event.start)) : dateKey(startOfDay(event.start));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets: HeatmapBucket[] = [];
  const stepStart = bucket === 'week' ? startOfWeek(options.start) : startOfDay(options.start);
  const cursor = new Date(stepStart);
  const last = startOfDay(options.end);
  while (cursor <= last) {
    const key = dateKey(cursor);
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + (bucket === 'week' ? 7 : 1));
  }
  return buckets;
}
