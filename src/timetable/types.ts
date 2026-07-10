export interface TransportResponse {
  readonly status: number;
  readonly url?: string;
  text(): Promise<string>;
}

export type AuthenticatedTransport = (
  url: URL,
  init: RequestInit,
) => Promise<TransportResponse>;

export interface AcademicTermRef {
  /** Opaque JWXT academic-year code (`xnm`). */
  academicYear: string;
  /** Opaque JWXT semester code (`xqm`). */
  semester: string;
}

export interface AcademicTerm extends AcademicTermRef {
  academicYearLabel: string;
  semesterLabel: string;
  current: boolean;
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimetableMeeting {
  /** Teaching-class identifier. It must never be derived from a student id. */
  sourceId: string | null;
  courseName: string;
  teacherNames: readonly string[];
  location: string | null;
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
  weeks: readonly number[];
  kind: 'regular' | 'practice' | 'other';
}

export interface TimetablePeriod {
  period: number;
  label: string | null;
  start: string;
  end: string;
}

export interface TimetableCalendarDay {
  week: number;
  weekday: Weekday;
  /** Local campus date, formatted as YYYY-MM-DD. */
  date: string;
}

export type TimetableUnresolvedSourceField =
  | 'kcmc'
  | 'xqj'
  | 'zcd'
  | 'jcs'
  | 'cdmc'
  | 'qsjsz'
  | 'xksj'
  | 'sjkcgs'
  | 'qtkcgs';

/**
 * An identity-free, allowlisted view of a row that cannot safely become a
 * calendar event. Upstream field names are retained where their semantics
 * have not been verified; the original response object is never exposed.
 */
export interface TimetableUnresolvedItem {
  kind: 'practice' | 'other';
  itemIndex: number;
  sourceFields: Readonly<Partial<Record<TimetableUnresolvedSourceField, string>>>;
}

export type TimetableWarningCode =
  | 'INVALID_MEETING'
  | 'UNRESOLVED_PRACTICE'
  | 'INVALID_PERIOD'
  | 'CALENDAR_DATES_UNAVAILABLE'
  | 'PERIODS_UNAVAILABLE';

export interface TimetableWarning {
  code: TimetableWarningCode;
  itemIndex?: number;
  field?: string;
}

export interface Timetable {
  term: AcademicTermRef;
  meetings: readonly TimetableMeeting[];
  unresolvedItems: readonly TimetableUnresolvedItem[];
  periods: readonly TimetablePeriod[];
  calendarDays: readonly TimetableCalendarDay[];
  warnings: readonly TimetableWarning[];
  fetchedAt: Date;
}

export type TimetableErrorCode =
  | 'SESSION_EXPIRED'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_TERM_CATALOG'
  | 'INVALID_TIMETABLE'
  | 'TERM_MISMATCH'
  | 'MISSING_CALENDAR_DATES'
  | 'MISSING_PERIOD_TIME';

export class TimetableError extends Error {
  readonly code: TimetableErrorCode;
  readonly status?: number;

  constructor(
    code: TimetableErrorCode,
    message: string,
    options: { status?: number } = {},
  ) {
    super(message);
    this.name = 'TimetableError';
    this.code = code;
    this.status = options.status;
  }
}

export interface TimetableRequestOptions {
  signal?: AbortSignal;
}

export interface NbtTimetableClient {
  listTerms(options?: TimetableRequestOptions): Promise<AcademicTerm[]>;
  fetchTerm(
    term: AcademicTermRef,
    options?: TimetableRequestOptions,
  ): Promise<Timetable>;
  /** Fetches sequentially to avoid unnecessary load on the campus system. */
  fetchTerms(
    terms: readonly AcademicTermRef[],
    options?: TimetableRequestOptions,
  ): Promise<Timetable[]>;
}

export interface CreateNbtTimetableClientOptions {
  /** JWXT origin (direct or WebVPN), never an authentication URL. */
  baseUrl: string | URL;
  now?: () => Date;
}

export interface IcsPeriodTime {
  start: string;
  end: string;
}

export interface TimetableToIcsOptions {
  /** Used only when the response does not include an authoritative date map. */
  weekOneMonday?: string;
  /** Overrides or supplements the period table returned by JWXT. */
  periodTimes?: Readonly<Record<number, IcsPeriodTime>>;
  generatedAt?: Date;
  calendarName?: string;
  uidDomain?: string;
}
