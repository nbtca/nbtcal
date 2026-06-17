import ICAL, { Event as ICalEvent, Time as ICalTime } from 'ical.js';
import type { ParsedCalendar } from './parse.js';
import type { CalendarEvent } from './types.js';

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
