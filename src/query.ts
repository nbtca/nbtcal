import ICAL from 'ical.js';
import type {
  ParsedCalendar,
  ParsedCalendarComponent,
  ParsedCalendarEvent,
  ParsedCalendarTime,
} from './parse.js';
import type {
  CalendarEvent,
  UpcomingOptions,
  PastOptions,
  HeatmapOptions,
  HeatmapBucket,
} from './types.js';

function civilDate(time: ParsedCalendarTime): Date | null {
  if (!time.isDate) return null;
  const { year, month, day } = time;
  if (
    typeof year !== 'number' ||
    typeof month !== 'number' ||
    typeof day !== 'number' ||
    !Number.isSafeInteger(year) ||
    !Number.isSafeInteger(month) ||
    !Number.isSafeInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  // Date.UTC treats years 0..99 as 1900..1999. setUTCFullYear preserves the
  // actual iCalendar civil year and also lets us reject impossible dates.
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(year, month - 1, day);
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() + 1 !== month ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function calendarTimeToDate(time: ParsedCalendarTime): Date {
  return civilDate(time) ?? time.toJSDate();
}

function toCalendarEvent(
  event: ParsedCalendarEvent,
  startTime: ParsedCalendarTime,
  endTime: ParsedCalendarTime | null,
  recurring: boolean,
): CalendarEvent {
  return {
    uid: event.uid,
    title: event.summary || null,
    start: calendarTimeToDate(startTime),
    end: endTime ? calendarTimeToDate(endTime) : null,
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

interface RankedOccurrence {
  occurrence: CalendarEvent;
  recurrenceStart: number;
}

function compareRankedOccurrences(a: RankedOccurrence, b: RankedOccurrence): number {
  return (
    a.occurrence.start.getTime() - b.occurrence.start.getTime() ||
    a.recurrenceStart - b.recurrenceStart
  );
}

function insertRankedOccurrence(
  candidates: RankedOccurrence[],
  candidate: RankedOccurrence,
  limit: number,
): void {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const current = candidates[middle];
    if (current && compareRankedOccurrences(current, candidate) <= 0) low = middle + 1;
    else high = middle;
  }
  if (low >= limit) return;
  candidates.splice(low, 0, candidate);
  if (candidates.length > limit) candidates.pop();
}

function modifiesFuture(event: ParsedCalendarEvent): boolean {
  const method = (event as ParsedCalendarEvent & { modifiesFuture?: () => boolean }).modifiesFuture;
  // ParsedCalendarEvent is public and intentionally exposes only the methods
  // query needs. Unknown implementations take the conservative expansion path.
  return typeof method !== 'function' || method.call(event);
}

interface IcalPropertyLike {
  getFirstValue(): unknown;
}

interface IcalComponentLike extends ParsedCalendarComponent {
  getAllProperties(name: string): readonly IcalPropertyLike[];
}

interface IcalTimeLike extends ParsedCalendarTime {
  readonly zone?: IcalTimezoneLike;
  utcOffset?(): number;
}

interface IcalTimezoneLike {
  readonly component?: unknown;
}

interface FixedIntervalRuleLike {
  readonly count?: unknown;
  readonly freq?: unknown;
  readonly interval?: unknown;
  readonly parts?: unknown;
  readonly until?: unknown;
}

interface FixedIntervalDescriptor {
  readonly duration: number;
  readonly lastIndex: number;
  readonly start: number;
  readonly step: number;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUtcDateTime(time: unknown): time is IcalTimeLike {
  if (!isRecord(time)) return false;
  const candidate = time as unknown as IcalTimeLike;
  return (
    !candidate.isDate &&
    typeof candidate.toJSDate === 'function' &&
    candidate.zone === ICAL.Timezone.utcTimezone
  );
}

interface FixedIntervalStep {
  readonly arithmetic: boolean;
  readonly milliseconds: number;
}

function fixedIntervalRuleStep(
  rule: FixedIntervalRuleLike,
  allowDailyMembership: boolean,
): FixedIntervalStep | null {
  const units: Readonly<Record<string, number>> = {
    SECONDLY: 1_000,
    MINUTELY: 60_000,
    HOURLY: 3_600_000,
    ...(allowDailyMembership ? { DAILY: 86_400_000 } : {}),
  };
  if (typeof rule.freq !== 'string') return null;
  const unit = units[rule.freq];
  if (unit === undefined) return null;
  if (!Number.isSafeInteger(rule.interval) || (rule.interval as number) < 1) return null;
  if (!isRecord(rule.parts) || Object.keys(rule.parts).length > 0) return null;
  const step = unit * (rule.interval as number);
  return Number.isSafeInteger(step)
    ? { arithmetic: rule.freq !== 'DAILY', milliseconds: step }
    : null;
}

function fixedIntervalDescriptor(
  event: ParsedCalendarEvent,
  allowDailyMembership = false,
): FixedIntervalDescriptor | null {
  if (!isUtcDateTime(event.startDate) || !isUtcDateTime(event.endDate)) return null;
  const component = event.component as Partial<IcalComponentLike>;
  if (typeof component.getAllProperties !== 'function') return null;
  const rules = component.getAllProperties('rrule');
  if (
    rules.length !== 1 ||
    component.getAllProperties('rdate').length !== 0 ||
    component.getAllProperties('exdate').length !== 0
  ) {
    return null;
  }

  const ruleProperty = rules[0];
  if (!isRecord(ruleProperty) || typeof ruleProperty.getFirstValue !== 'function') return null;
  const rule = ruleProperty.getFirstValue();
  if (!isRecord(rule)) return null;
  const interval = fixedIntervalRuleStep(rule, allowDailyMembership);
  if (interval === null || (!allowDailyMembership && !interval.arithmetic)) return null;
  const step = interval.milliseconds;

  const count = rule.count;
  if (count !== null && (!Number.isSafeInteger(count) || (count as number) < 1)) return null;
  const until = rule.until;
  if (until !== null && !isUtcDateTime(until)) return null;
  const start = event.startDate.toJSDate().getTime();
  const eventEnd = event.endDate.toJSDate().getTime();
  const untilTime = until === null ? null : until.toJSDate().getTime();
  const duration = eventEnd - start;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(eventEnd) ||
    !Number.isSafeInteger(duration) ||
    duration < 0 ||
    (untilTime !== null && !Number.isSafeInteger(untilTime))
  ) {
    return null;
  }

  let lastIndex = count === null ? Number.POSITIVE_INFINITY : (count as number) - 1;
  if (untilTime !== null) {
    const untilDelta = untilTime - start;
    if (!Number.isSafeInteger(untilDelta)) return null;
    lastIndex = Math.min(lastIndex, Math.floor(untilDelta / step));
  }
  return { duration, lastIndex, start, step };
}

function fixedIntervalRecurrenceIndex(
  descriptor: FixedIntervalDescriptor,
  recurrenceId: ParsedCalendarTime,
): number | null {
  if (!isUtcDateTime(recurrenceId)) return null;
  const recurrenceStart = recurrenceId.toJSDate().getTime();
  const delta = recurrenceStart - descriptor.start;
  if (!Number.isSafeInteger(recurrenceStart) || !Number.isSafeInteger(delta)) return null;
  if (delta < 0 || delta % descriptor.step !== 0) return null;
  const index = delta / descriptor.step;
  return Number.isSafeInteger(index) && index <= descriptor.lastIndex ? index : null;
}

function validFixedIntervalExceptions(
  descriptor: FixedIntervalDescriptor,
  exceptions: readonly ParsedCalendarEvent[],
): readonly ParsedCalendarEvent[] | null {
  if (exceptions.some(modifiesFuture)) return null;
  // With the recurrence set proven arithmetically, a direct exception whose
  // RECURRENCE-ID is not a member is an orphan. ical.js never visits it during
  // normal expansion, so ignoring it preserves that behavior without letting
  // an attacker force a scan to an arbitrary remote id.
  return exceptions.filter(
    (exception) => fixedIntervalRecurrenceIndex(descriptor, exception.recurrenceId) !== null,
  );
}

function fixedTime(timestamp: number): ParsedCalendarTime {
  return { isDate: false, toJSDate: () => new Date(timestamp) };
}

interface OffsetBounds {
  readonly maximum: number;
  readonly minimum: number;
}

const ICAL_MINIMUM_UTC_OFFSET_SECONDS = -12 * 60 * 60;
const ICAL_MAXIMUM_UTC_OFFSET_SECONDS = 14 * 60 * 60;

function utcOffsetSeconds(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const toSeconds = (value as { toSeconds?: () => unknown }).toSeconds;
  if (typeof toSeconds !== 'function') return null;
  const seconds = toSeconds.call(value);
  return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : null;
}

function offsetBounds(time: ParsedCalendarTime): OffsetBounds {
  const candidate = time as IcalTimeLike;
  if (candidate.zone === ICAL.Timezone.utcTimezone) {
    return { maximum: 0, minimum: 0 };
  }
  if (candidate.zone === ICAL.Timezone.localTimezone) {
    // Floating times are converted through the host's local Date rules by
    // ical.js, so their effective offset can change even though utcOffset()
    // reports zero.
    return {
      maximum: ICAL_MAXIMUM_UTC_OFFSET_SECONDS,
      minimum: ICAL_MINIMUM_UTC_OFFSET_SECONDS,
    };
  }

  const offsets: number[] = [];
  const current = typeof candidate.utcOffset === 'function' ? candidate.utcOffset() : null;
  if (typeof current === 'number' && Number.isFinite(current)) offsets.push(current);
  const component = candidate.zone?.component;
  if (component instanceof ICAL.Component) {
    for (const observance of component.getAllSubcomponents()) {
      for (const name of ['tzoffsetfrom', 'tzoffsetto']) {
        const offset = utcOffsetSeconds(observance.getFirstPropertyValue(name));
        if (offset !== null) offsets.push(offset);
      }
    }
  }
  if (offsets.length === 0) {
    // ical.js normalizes every UtcOffset into the real-world -12:00..+14:00
    // range. This remains safe for an opaque timezone implementation while
    // avoiding any assumption about a particular DST rule.
    return {
      maximum: ICAL_MAXIMUM_UTC_OFFSET_SECONDS,
      minimum: ICAL_MINIMUM_UTC_OFFSET_SECONDS,
    };
  }
  return { maximum: Math.max(...offsets), minimum: Math.min(...offsets) };
}

function rangeBackwardShiftAllowance(
  recurrencePrototype: ParsedCalendarTime,
  exception: ParsedCalendarEvent,
): number {
  const recurrenceZone = (recurrencePrototype as IcalTimeLike).zone;
  const actualZone = (exception.startDate as IcalTimeLike).zone;
  if (
    recurrenceZone === ICAL.Timezone.localTimezone ||
    actualZone === ICAL.Timezone.localTimezone
  ) {
    return (ICAL_MAXIMUM_UTC_OFFSET_SECONDS - ICAL_MINIMUM_UTC_OFFSET_SECONDS) * 2 * 1_000;
  }
  const recurrenceBounds = offsetBounds(recurrencePrototype);
  const actualBounds = offsetBounds(exception.startDate);
  const recurrenceOffset = (exception.recurrenceId as IcalTimeLike).utcOffset?.();
  const actualOffset = (exception.startDate as IcalTimeLike).utcOffset?.();
  if (
    typeof recurrenceOffset !== 'number' ||
    !Number.isFinite(recurrenceOffset) ||
    typeof actualOffset !== 'number' ||
    !Number.isFinite(actualOffset)
  ) {
    return (ICAL_MAXIMUM_UTC_OFFSET_SECONDS - ICAL_MINIMUM_UTC_OFFSET_SECONDS) * 2 * 1_000;
  }

  // For a RANGE exception ical.js applies one fixed civil-time duration. The
  // only variation in its epoch shift is therefore the recurrence and target
  // zones' UTC offsets. Bound the largest future backwards movement using all
  // offsets declared by both VTIMEZONEs.
  return Math.max(
    0,
    (recurrenceOffset - recurrenceBounds.minimum + actualBounds.maximum - actualOffset) * 1_000,
  );
}

function expandLimitedFixedInterval(
  event: ParsedCalendarEvent,
  start: Date,
  end: Date,
  limit: number,
  exceptions: readonly ParsedCalendarEvent[],
  descriptor: FixedIntervalDescriptor,
): CalendarEvent[] | null {
  const candidates: RankedOccurrence[] = [];
  const replacedIndices = new Set<number>();

  // Direct exceptions are complete candidates in their own right. Preselecting
  // them avoids walking a high-frequency rule all the way to a far recurrence
  // id merely to discover that it was moved into the query window.
  for (const exception of exceptions) {
    const recurrenceIndex = fixedIntervalRecurrenceIndex(descriptor, exception.recurrenceId);
    if (recurrenceIndex === null) return null;
    const recurrenceStart = exception.recurrenceId.toJSDate().getTime();
    replacedIndices.add(recurrenceIndex);
    if (isCancelled(exception)) continue;
    const actualStart = exception.startDate.toJSDate();
    if (actualStart >= start && actualStart < end) {
      insertRankedOccurrence(
        candidates,
        {
          occurrence: toCalendarEvent(exception, exception.startDate, exception.endDate, true),
          recurrenceStart,
        },
        limit,
      );
    }
  }

  const startTime = start.getTime();
  const endTime = end.getTime();
  const startDelta = startTime - descriptor.start;
  if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime)) return null;
  if (!Number.isSafeInteger(startDelta)) return null;

  let index = Math.max(0, Math.ceil(startDelta / descriptor.step));
  while (index <= descriptor.lastIndex) {
    const recurrenceStart = descriptor.start + index * descriptor.step;
    if (!Number.isSafeInteger(recurrenceStart)) return null;
    if (recurrenceStart >= endTime) break;

    const latestSelectedStart = candidates.at(-1)?.occurrence.start.getTime();
    if (
      candidates.length >= limit &&
      latestSelectedStart !== undefined &&
      recurrenceStart > latestSelectedStart
    ) {
      break;
    }
    if (!replacedIndices.has(index)) {
      const recurrenceEnd = recurrenceStart + descriptor.duration;
      if (!Number.isSafeInteger(recurrenceEnd)) return null;
      insertRankedOccurrence(
        candidates,
        {
          occurrence: toCalendarEvent(
            event,
            fixedTime(recurrenceStart),
            fixedTime(recurrenceEnd),
            true,
          ),
          recurrenceStart,
        },
        limit,
      );
    }
    index += 1;
  }

  return candidates.map(({ occurrence }) => occurrence);
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
    const occStart = calendarTimeToDate(event.startDate);
    if (occStart >= start && occStart < end) {
      return [toCalendarEvent(event, event.startDate, event.endDate, false)];
    }
    return [];
  }

  const out: CalendarEvent[] = [];
  const exceptions = Object.values(event.exceptions);
  const finiteLimit = Number.isFinite(limit);
  const descriptor = finiteLimit ? fixedIntervalDescriptor(event) : null;
  const fixedExceptions = descriptor ? validFixedIntervalExceptions(descriptor, exceptions) : null;
  if (descriptor && fixedExceptions) {
    const fixedOccurrences = expandLimitedFixedInterval(
      event,
      start,
      end,
      limit,
      fixedExceptions,
      descriptor,
    );
    if (fixedOccurrences) return fixedOccurrences;
  }
  const membershipDescriptor = fixedIntervalDescriptor(event, true);
  const effectiveExceptions = membershipDescriptor
    ? exceptions.filter(
        (exception) =>
          modifiesFuture(exception) ||
          fixedIntervalRecurrenceIndex(membershipDescriptor, exception.recurrenceId) !== null,
      )
    : exceptions;
  // NOTE: Do NOT pass a start Time to event.iterator() — ical.js uses the
  // seed time's date components verbatim, which resets the time-of-day on
  // UTC events (e.g. 12:00Z becomes 00:00Z). The conservative fallback must
  // iterate from the beginning and filter in JavaScript instead.
  const iterator = event.iterator();
  const cancelledRecurrences = new Set(
    effectiveExceptions
      .filter(isCancelled)
      .map((exception) => calendarTimeToDate(exception.recurrenceId).getTime()),
  );
  const hasRangeException = effectiveExceptions.some(modifiesFuture);
  const backwardShift = effectiveExceptions.reduce((largest, exception) => {
    if (isCancelled(exception)) return largest;
    const anchorShift =
      calendarTimeToDate(exception.recurrenceId).getTime() -
      calendarTimeToDate(exception.startDate).getTime();
    const safeShift = modifiesFuture(exception)
      ? anchorShift + rangeBackwardShiftAllowance(event.startDate, exception)
      : anchorShift;
    return Math.max(largest, safeShift);
  }, 0);
  const recurrenceEnd = end.getTime() + backwardShift;
  const selectionBoundaryReached = (recurrenceStart: number): boolean => {
    if (hasRangeException || !finiteLimit || out.length < limit) return false;
    const latestSelectedStart = out.reduce(
      (latest, occurrence) => Math.max(latest, occurrence.start.getTime()),
      Number.NEGATIVE_INFINITY,
    );
    // Recurrence exceptions can move a later recurrence backwards. Once even
    // the largest known backwards shift cannot beat the current selection,
    // later recurrence ids cannot change the first `limit` actual starts.
    return recurrenceStart - backwardShift >= latestSelectedStart;
  };
  let next: ParsedCalendarTime | null;
  while ((next = iterator.next())) {
    const recurrenceStart = calendarTimeToDate(next).getTime();
    if (recurrenceStart >= recurrenceEnd || selectionBoundaryReached(recurrenceStart)) break;
    if (!cancelledRecurrences.has(recurrenceStart)) {
      const details = event.getOccurrenceDetails(next);
      if (!isCancelled(details.item)) {
        const actualStart = calendarTimeToDate(details.startDate);
        if (actualStart >= start && actualStart < end) {
          out.push(toCalendarEvent(details.item, details.startDate, details.endDate, true));
          if (out.length > limit) {
            out.sort((a, b) => a.start.getTime() - b.start.getTime());
            out.length = limit;
          }
        }
      }
    }
    if (selectionBoundaryReached(recurrenceStart)) break;
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

// DATE values have no time zone. ical.js exposes them as host-local midnight,
// so interpreting that instant in another zone can move the calendar date.
function allDayCivilProxy(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
  const firstCivilDay = civilProxy(options.start, timeZone);
  const lastCivilDay = civilProxy(options.end, timeZone);

  // Pad the query two days each side so events whose civil date (in the target
  // zone) lands on a boundary day are captured regardless of the zone's UTC
  // offset. Events outside the dense range produce keys that are never emitted,
  // so they are harmlessly ignored.
  const events = occurrencesInRange(
    parsed,
    new Date(options.start.getTime() - 2 * DAY_MS),
    new Date(options.end.getTime() + 2 * DAY_MS),
  );

  const counts = new Map<string, number>();
  for (const event of events) {
    const eventCivilDay = event.isAllDay
      ? allDayCivilProxy(event.start)
      : civilProxy(event.start, timeZone);
    if (eventCivilDay < firstCivilDay || eventCivilDay > lastCivilDay) continue;
    const key = proxyKey(bucket === 'week' ? weekStartProxy(eventCivilDay) : eventCivilDay);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cursor = bucket === 'week' ? weekStartProxy(firstCivilDay) : new Date(firstCivilDay);
  const last = bucket === 'week' ? weekStartProxy(lastCivilDay) : lastCivilDay;

  const buckets: HeatmapBucket[] = [];
  while (cursor <= last) {
    const key = proxyKey(cursor);
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + (bucket === 'week' ? 7 : 1));
  }
  return buckets;
}
