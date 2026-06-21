import ICAL, { Event as ICalEvent, Time as ICalTime } from 'ical.js';
import type { ParsedCalendar } from './parse.js';
import type { CalendarEvent, UpcomingOptions, PastOptions, HeatmapOptions, HeatmapBucket } from './types.js';

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
  const end = new Date(now.getTime() + days * DAY_MS);
  return occurrencesInRange(parsed, now, end);
}

export function past(parsed: ParsedCalendar, options: PastOptions = {}): CalendarEvent[] {
  const days = options.days ?? 30;
  const now = new Date();
  const start = new Date(now.getTime() - days * DAY_MS);
  return occurrencesInRange(parsed, start, now);
}

// next() scans at most one year ahead so an unbounded RRULE stays bounded. It
// may therefore return fewer than `count` occurrences when the following one is
// further out than the horizon — a deliberate cap for the "what's coming up" use.
export function next(parsed: ParsedCalendar, count: number): CalendarEvent[] {
  const now = new Date();
  const horizon = new Date(now.getTime() + NEXT_HORIZON_DAYS * DAY_MS);
  return occurrencesInRange(parsed, now, horizon).slice(0, Math.max(0, count));
}

const HEATMAP_DEFAULT_TIME_ZONE = 'Asia/Shanghai';

// The calendar date (YYYY-MM-DD) of an instant as seen in a given IANA time
// zone. en-CA formats as an ISO-style YYYY-MM-DD string.
function civilDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// A UTC-midnight proxy Date for an instant's civil date in the target zone,
// used for time-zone-independent day/week arithmetic (weekday, stepping).
function civilProxy(date: Date, timeZone: string): Date {
  const [y, m, d] = civilDateKey(date, timeZone).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function proxyKey(proxy: Date): string {
  const y = proxy.getUTCFullYear();
  const m = String(proxy.getUTCMonth() + 1).padStart(2, '0');
  const d = String(proxy.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Monday of the week containing the given UTC-midnight proxy.
function weekStartProxy(proxy: Date): Date {
  const out = new Date(proxy);
  const diff = (out.getUTCDay() + 6) % 7; // days since Monday
  out.setUTCDate(out.getUTCDate() - diff);
  return out;
}

export function heatmap(parsed: ParsedCalendar, options: HeatmapOptions): HeatmapBucket[] {
  const bucket = options.bucket ?? 'day';
  const timeZone = options.timeZone ?? HEATMAP_DEFAULT_TIME_ZONE;

  // Pad the query two days each side so events whose civil date (in the target
  // zone) lands on a boundary day are captured regardless of the zone's UTC
  // offset. Events outside the dense range produce keys that are never emitted,
  // so they are harmlessly ignored.
  const events = occurrencesInRange(
    parsed,
    new Date(options.start.getTime() - 2 * DAY_MS),
    new Date(options.end.getTime() + 2 * DAY_MS),
  );

  const bucketKey = (date: Date): string => {
    const proxy = civilProxy(date, timeZone);
    return proxyKey(bucket === 'week' ? weekStartProxy(proxy) : proxy);
  };

  const counts = new Map<string, number>();
  for (const event of events) {
    const key = bucketKey(event.start);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cursor = bucket === 'week'
    ? weekStartProxy(civilProxy(options.start, timeZone))
    : civilProxy(options.start, timeZone);
  const last = bucket === 'week'
    ? weekStartProxy(civilProxy(options.end, timeZone))
    : civilProxy(options.end, timeZone);

  const buckets: HeatmapBucket[] = [];
  while (cursor <= last) {
    const key = proxyKey(cursor);
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + (bucket === 'week' ? 7 : 1));
  }
  return buckets;
}
