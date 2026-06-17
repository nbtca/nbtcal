// Minimal ambient types for the subset of ical.js this library uses.
declare module 'ical.js' {
  export class Time {
    isDate: boolean;
    toJSDate(): Date;
    static fromJSDate(date: Date, useUTC?: boolean): Time;
  }

  export class Event {
    constructor(component: Component);
    uid: string;
    summary: string;
    location: string;
    description: string;
    startDate: Time;
    endDate: Time;
    isRecurring(): boolean;
    iterator(start?: Time): RecurExpansion;
    getOccurrenceDetails(time: Time): { startDate: Time; endDate: Time; item: Event };
  }

  export class RecurExpansion {
    next(): Time | null;
  }

  export class Component {
    constructor(jcal: unknown);
    getAllSubcomponents(name?: string): Component[];
  }

  export function parse(input: string): unknown;

  const ICAL: {
    Time: typeof Time;
    Event: typeof Event;
    Component: typeof Component;
    parse: typeof parse;
  };
  export default ICAL;
}
