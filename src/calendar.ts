import { fetchFeed, type FetchFeedOptions } from './feed.js';
import { parseCalendar, type ParsedCalendar } from './parse.js';
import { occurrencesInRange, upcoming, past, next, heatmap } from './query.js';
import type { CalendarEvent, UpcomingOptions, PastOptions, HeatmapOptions, HeatmapBucket } from './types.js';

export interface Calendar {
  upcoming(options?: UpcomingOptions): CalendarEvent[];
  past(options?: PastOptions): CalendarEvent[];
  next(count: number): CalendarEvent[];
  inRange(start: Date, end: Date): CalendarEvent[];
  heatmap(options: HeatmapOptions): HeatmapBucket[];
}

export interface LoadCalendarOptions extends FetchFeedOptions {
  url?: string;
}

export function createCalendar(parsed: ParsedCalendar): Calendar {
  return {
    upcoming: (options) => upcoming(parsed, options),
    past: (options) => past(parsed, options),
    next: (count) => next(parsed, count),
    inRange: (start, end) => occurrencesInRange(parsed, start, end),
    heatmap: (options) => heatmap(parsed, options),
  };
}

export async function loadCalendar(options: LoadCalendarOptions = {}): Promise<Calendar> {
  const { url, ...fetchOptions } = options;
  const text = await fetchFeed(url, fetchOptions);
  return createCalendar(parseCalendar(text));
}
