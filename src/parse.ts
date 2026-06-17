import ICAL, { Event as ICalEvent } from 'ical.js';
import { FeedParseError } from './types.js';

export interface ParsedCalendar {
  vevents: ICalEvent[];
}

export function parseCalendar(icsText: string): ParsedCalendar {
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

  const vevents = subcomponents.map((c) => new ICAL.Event(c));
  return { vevents };
}

function looksLikeCalendar(text: string): boolean {
  return text.includes('BEGIN:VCALENDAR');
}
