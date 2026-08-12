import ICAL from 'ical.js';
import { FeedParseError } from './types.js';

export interface ParsedCalendarTime {
  readonly isDate: boolean;
  toJSDate(): Date;
}

export interface ParsedCalendarComponent {
  getFirstPropertyValue(name: string): unknown;
}

export interface ParsedCalendarIterator {
  next(): ParsedCalendarTime | null;
}

export interface ParsedCalendarOccurrence {
  readonly item: ParsedCalendarEvent;
  readonly startDate: ParsedCalendarTime;
  readonly endDate: ParsedCalendarTime;
}

export interface ParsedCalendarEvent {
  readonly uid: string;
  readonly summary: string;
  readonly location: string;
  readonly description: string;
  readonly component: ParsedCalendarComponent;
  readonly startDate: ParsedCalendarTime;
  readonly endDate: ParsedCalendarTime;
  readonly recurrenceId: ParsedCalendarTime;
  readonly exceptions: Readonly<Record<string, ParsedCalendarEvent>>;
  isRecurring(): boolean;
  iterator(): ParsedCalendarIterator;
  getOccurrenceDetails(occurrence: ParsedCalendarTime): ParsedCalendarOccurrence;
}

export interface ParsedCalendar {
  readonly vevents: readonly ParsedCalendarEvent[];
}

type IcalEvent = InstanceType<typeof ICAL.Event>;

function hasIndexedExceptions(event: IcalEvent): event is IcalEvent & ParsedCalendarEvent {
  const exceptions: unknown = event.exceptions;
  return typeof exceptions === 'object' && exceptions !== null && !Array.isArray(exceptions);
}

export function parseCalendar(icsText: string): ParsedCalendar {
  if (icsText.trim().length === 0) throw new FeedParseError('ICS feed is empty');
  let component: InstanceType<typeof ICAL.Component>;
  try {
    component = ICAL.Component.fromString(icsText);
  } catch (err) {
    throw new FeedParseError('Failed to parse ICS feed', { cause: err });
  }

  const subcomponents = component.getAllSubcomponents('vevent');
  if (subcomponents.length === 0 && !looksLikeCalendar(icsText)) {
    throw new FeedParseError('Input does not contain a VCALENDAR');
  }

  const allEvents = subcomponents.map(
    (c) =>
      new ICAL.Event(c, {
        strictExceptions: true,
        exceptions: [],
      }),
  );
  for (const event of allEvents) {
    if (typeof event.uid !== 'string' || event.uid.trim().length === 0) {
      throw new FeedParseError('VEVENT is missing UID');
    }
    const start = event.component.getFirstPropertyValue('dtstart');
    if (start !== null) continue;
    const status = event.component.getFirstPropertyValue('status');
    const cancelledException =
      event.isRecurrenceException() &&
      typeof status === 'string' &&
      status.toUpperCase() === 'CANCELLED';
    if (!cancelledException) throw new FeedParseError('VEVENT is missing DTSTART');
  }
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
  for (const event of allEvents) {
    if (event.isRecurrenceException()) continue;
    const current = masters.get(event.uid);
    if (!current || (!current.isRecurring() && event.isRecurring())) masters.set(event.uid, event);
  }
  const related = new Set<InstanceType<typeof ICAL.Event>>();
  for (const event of allEvents) {
    if (!event.isRecurrenceException()) continue;
    const master = masters.get(event.uid);
    if (!master) continue;
    master.relateException(event);
    related.add(event);
  }
  const vevents = allEvents.filter((event) => !related.has(event));
  if (!vevents.every(hasIndexedExceptions)) {
    throw new FeedParseError('Calendar parser returned an unsupported exception collection');
  }
  return { vevents };
}

function looksLikeCalendar(text: string): boolean {
  return text.includes('BEGIN:VCALENDAR');
}
