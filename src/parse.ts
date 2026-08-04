import ICAL, { Event as ICalEvent } from 'ical.js';
import { FeedParseError } from './types.js';

export interface ParsedCalendar {
  vevents: ICalEvent[];
}

export function parseCalendar(icsText: string): ParsedCalendar {
  if (icsText.trim().length === 0) throw new FeedParseError('ICS feed is empty');
  let component: InstanceType<typeof ICAL.Component>;
  try {
    const jcal = ICAL.parse(icsText);
    component = new ICAL.Component(jcal);
  } catch (err) {
    throw new FeedParseError('Failed to parse ICS feed', { cause: err });
  }

  const subcomponents = component.getAllSubcomponents('vevent');
  if (subcomponents.length === 0 && !looksLikeCalendar(icsText)) {
    throw new FeedParseError('Input does not contain a VCALENDAR');
  }

  const allEvents = subcomponents.map((c) => new ICAL.Event(c, {
    strictExceptions: true,
    exceptions: [],
  }));
  for (const event of allEvents) {
    if (typeof event.uid !== 'string' || event.uid.trim().length === 0) {
      throw new FeedParseError('VEVENT is missing UID');
    }
    if (event.component.getFirstPropertyValue('dtstart') != null) continue;
    const status = event.component.getFirstPropertyValue('status');
    const cancelledException = event.isRecurrenceException()
      && typeof status === 'string'
      && status.toUpperCase() === 'CANCELLED';
    if (!cancelledException) throw new FeedParseError('VEVENT is missing DTSTART');
  }
  const masters = new Map<string, ICalEvent>();
  for (const event of allEvents) {
    if (event.isRecurrenceException()) continue;
    const current = masters.get(event.uid);
    if (!current || (!current.isRecurring() && event.isRecurring())) masters.set(event.uid, event);
  }
  const related = new Set<ICalEvent>();
  for (const event of allEvents) {
    if (!event.isRecurrenceException()) continue;
    const master = masters.get(event.uid);
    if (!master) continue;
    master.relateException(event);
    related.add(event);
  }
  const vevents = allEvents.filter((event) => !related.has(event));
  return { vevents };
}

function looksLikeCalendar(text: string): boolean {
  return text.includes('BEGIN:VCALENDAR');
}
