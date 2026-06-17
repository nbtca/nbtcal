export interface CalendarEvent {
  uid: string;
  title: string | null;
  start: Date;
  end: Date | null;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  recurring: boolean;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UpcomingOptions {
  days?: number;
}

export interface HeatmapOptions {
  start: Date;
  end: Date;
  bucket?: 'day' | 'week';
}

export interface HeatmapBucket {
  date: string;
  count: number;
}

export class FeedFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FeedFetchError';
  }
}

export class FeedParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FeedParseError';
  }
}
