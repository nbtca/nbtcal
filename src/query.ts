import type { ParsedCalendar, ParsedCalendarEvent, ParsedCalendarTime } from './parse.js';
import type {
  CalendarEvent,
  UpcomingOptions,
  PastOptions,
  HeatmapOptions,
  HeatmapBucket,
} from './types.js';

function toCalendarEvent(
  event: ParsedCalendarEvent,
  startTime: ParsedCalendarTime,
  endTime: ParsedCalendarTime | null,
  recurring: boolean,
): CalendarEvent {
  return {
    uid: event.uid,
    title: event.summary || null,
    start: startTime.toJSDate(),
    end: endTime ? endTime.toJSDate() : null,
    isAllDay: startTime.isDate,
    location: event.location || null,
    description: event.description || null,
    recurring,
  };
}

function isCancelled(event: ParsedCalendarEvent): boolean {
  const status = event.component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

function expand(
  event: ParsedCalendarEvent,
  start: Date,
  end: Date,
  limit: number,
): CalendarEvent[] {
  if (limit === 0) return [];
  if (isCancelled(event)) return [];
  if (!event.isRecurring()) {
    const occStart = event.startDate.toJSDate();
    if (occStart >= start && occStart < end) {
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
  const exceptions = Object.values(event.exceptions);
  const cancelledRecurrences = new Set(
    exceptions.filter(isCancelled).map((exception) => exception.recurrenceId.toJSDate().getTime()),
  );
  const backwardShift = exceptions.reduce((largest, exception) => {
    if (isCancelled(exception)) return largest;
    return Math.max(
      largest,
      exception.recurrenceId.toJSDate().getTime() - exception.startDate.toJSDate().getTime(),
    );
  }, 0);
  const recurrenceEnd = end.getTime() + backwardShift;
  let next: ParsedCalendarTime | null;
  while (out.length < limit && (next = iterator.next())) {
    const occStart = next.toJSDate();
    if (occStart.getTime() >= recurrenceEnd) break;
    if (cancelledRecurrences.has(occStart.getTime())) continue;
    const details = event.getOccurrenceDetails(next);
    if (isCancelled(details.item)) continue;
    const actualStart = details.startDate.toJSDate();
    if (actualStart < start || actualStart >= end) continue;
    out.push(toCalendarEvent(details.item, details.startDate, details.endDate, true));
  }
  return out;
}

function validateRange(start: Date, end: Date): void {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new RangeError('Range boundaries must be valid dates');
  }
  if (end.getTime() < start.getTime()) {
    throw new RangeError('Range end must not precede range start');
  }
}

function collectOccurrences(
  parsed: ParsedCalendar,
  start: Date,
  end: Date,
  limitPerEvent: number,
): CalendarEvent[] {
  validateRange(start, end);
  const events = parsed.vevents.flatMap((e) => expand(e, start, end, limitPerEvent));
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
}

export function occurrencesInRange(
  parsed: ParsedCalendar,
  start: Date,
  end: Date,
): CalendarEvent[] {
  return collectOccurrences(parsed, start, end, Number.POSITIVE_INFINITY);
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
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative safe integer');
  }
  if (count === 0) return [];
  const now = new Date();
  const horizon = new Date(now.getTime() + NEXT_HORIZON_DAYS * DAY_MS);
  return collectOccurrences(parsed, now, horizon, count).slice(0, count);
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
  const [year, month, day] = civilDateKey(date, timeZone).split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError('Unable to resolve a calendar date in the requested time zone');
  }
  return new Date(Date.UTC(year, month - 1, day));
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
  validateRange(options.start, options.end);
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

  const cursor =
    bucket === 'week'
      ? weekStartProxy(civilProxy(options.start, timeZone))
      : civilProxy(options.start, timeZone);
  const last =
    bucket === 'week'
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
