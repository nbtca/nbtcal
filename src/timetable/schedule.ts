import {
  TimetableError,
  type AcademicTerm,
  type Timetable,
  type TimetableMeeting,
  type Weekday,
} from './types.js';
import {
  addIsoDays,
  campusDateTime,
  campusIsoDate,
  isoDateIndex,
  isoWeekday,
  validateWeekOneMonday,
} from './date-time.js';

export interface TimetableScheduleOptions {
  weekOneMonday?: string;
}

export interface TimetableOccurrence {
  readonly meeting: TimetableMeeting;
  readonly week: number;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly start: Date;
  readonly end: Date;
}

export interface TimetableSchedule {
  readonly weekAt: (date: Date) => number;
  readonly weekdayAt: (date: Date) => Weekday;
  readonly meetingsInWeek: (week: number) => TimetableMeeting[];
  readonly meetingsOnDay: (week: number, weekday: Weekday) => TimetableMeeting[];
  readonly meetingAt: (week: number, weekday: Weekday, period: number) => TimetableMeeting | null;
  readonly occurrences: () => TimetableOccurrence[];
  readonly next: (after?: Date) => TimetableOccurrence | null;
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function requireWeekday(value: number): asserts value is Weekday {
  if (!Number.isSafeInteger(value) || value < 1 || value > 7) {
    throw new RangeError('weekday must be an integer from 1 through 7.');
  }
}

function compareMeetings(a: TimetableMeeting, b: TimetableMeeting): number {
  return (
    a.weekday - b.weekday ||
    a.startPeriod - b.startPeriod ||
    a.endPeriod - b.endPeriod ||
    a.courseName.localeCompare(b.courseName)
  );
}

function teachingDayOffset(week: number, weekday: Weekday): number {
  const offset = (week - 1) * 7 + weekday - 1;
  if (!Number.isSafeInteger(offset)) {
    throw new RangeError('week is too large to resolve safely.');
  }
  return offset;
}

function calendarDateMap(
  timetable: Timetable,
  weekOneMonday: string | undefined,
): Map<string, string> {
  const dates = new Map<string, string>();
  const slotsByDate = new Map<string, string>();
  const weekOneIndex = weekOneMonday === undefined ? undefined : isoDateIndex(weekOneMonday);

  for (const day of timetable.calendarDays) {
    requirePositiveInteger(day.week, 'calendarDays.week');
    requireWeekday(day.weekday);
    const dateIndex = isoDateIndex(day.date);
    if (isoWeekday(day.date) !== day.weekday) {
      throw new TimetableError(
        'MISSING_CALENDAR_DATES',
        'A timetable calendar date does not match its weekday.',
      );
    }

    const key = `${day.week}:${day.weekday}`;
    const existingDate = dates.get(key);
    if (existingDate !== undefined && existingDate !== day.date) {
      throw new TimetableError(
        'MISSING_CALENDAR_DATES',
        'The timetable contains conflicting dates for a teaching day.',
      );
    }
    const existingSlot = slotsByDate.get(day.date);
    if (existingSlot !== undefined && existingSlot !== key) {
      throw new TimetableError(
        'MISSING_CALENDAR_DATES',
        'The timetable maps one calendar date to multiple teaching days.',
      );
    }

    if (
      weekOneIndex !== undefined &&
      dateIndex !== weekOneIndex + teachingDayOffset(day.week, day.weekday)
    ) {
      throw new TimetableError(
        'MISSING_CALENDAR_DATES',
        'The authoritative calendar dates do not match weekOneMonday.',
      );
    }
    dates.set(key, day.date);
    slotsByDate.set(day.date, key);
  }
  return dates;
}

function copyOccurrence(occurrence: TimetableOccurrence): TimetableOccurrence {
  return {
    ...occurrence,
    start: new Date(occurrence.start.getTime()),
    end: new Date(occurrence.end.getTime()),
  };
}

export function campusWeekday(date: Date): Weekday {
  return isoWeekday(campusIsoDate(date));
}

export function createTimetableSchedule(
  timetable: Timetable,
  options: TimetableScheduleOptions = {},
): TimetableSchedule {
  if (options.weekOneMonday !== undefined) validateWeekOneMonday(options.weekOneMonday);

  const dates = calendarDateMap(timetable, options.weekOneMonday);
  const periods = new Map(timetable.periods.map((period) => [period.period, period] as const));
  let occurrenceCache: TimetableOccurrence[] | undefined;

  const dateFor = (week: number, weekday: Weekday): string => {
    const authoritative = dates.get(`${week}:${weekday}`);
    if (authoritative) return authoritative;
    if (!options.weekOneMonday) {
      throw new TimetableError(
        'MISSING_CALENDAR_DATES',
        'The timetable has no date map; weekOneMonday is required.',
      );
    }
    return addIsoDays(options.weekOneMonday, teachingDayOffset(week, weekday));
  };

  const buildOccurrences = (): TimetableOccurrence[] => {
    const occurrences: TimetableOccurrence[] = [];
    for (const meeting of timetable.meetings) {
      requireWeekday(meeting.weekday);
      requirePositiveInteger(meeting.startPeriod, 'startPeriod');
      requirePositiveInteger(meeting.endPeriod, 'endPeriod');
      const startTime = periods.get(meeting.startPeriod)?.start;
      const endTime = periods.get(meeting.endPeriod)?.end;
      if (!startTime || !endTime) {
        throw new TimetableError(
          'MISSING_PERIOD_TIME',
          'No time mapping exists for a timetable meeting.',
        );
      }
      for (const week of meeting.weeks) {
        requirePositiveInteger(week, 'week');
        const date = dateFor(week, meeting.weekday);
        const start = campusDateTime(date, startTime);
        const end = campusDateTime(date, endTime);
        if (end.getTime() <= start.getTime()) {
          throw new TimetableError(
            'MISSING_PERIOD_TIME',
            'A timetable meeting must end after it starts.',
          );
        }
        occurrences.push({ meeting, week, date, startTime, endTime, start, end });
      }
    }
    return occurrences.sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        a.end.getTime() - b.end.getTime() ||
        compareMeetings(a.meeting, b.meeting),
    );
  };

  const allOccurrences = (): TimetableOccurrence[] => {
    occurrenceCache ??= buildOccurrences();
    return occurrenceCache;
  };

  const meetingsOnDay = (week: number, weekday: Weekday): TimetableMeeting[] => {
    requirePositiveInteger(week, 'week');
    requireWeekday(weekday);
    return timetable.meetings
      .filter((meeting) => meeting.weekday === weekday && meeting.weeks.includes(week))
      .sort(compareMeetings);
  };

  return {
    weekAt(date) {
      const key = campusIsoDate(date);
      const authoritative = timetable.calendarDays.find((day) => day.date === key);
      if (authoritative) return authoritative.week;
      if (!options.weekOneMonday) {
        throw new TimetableError(
          'MISSING_CALENDAR_DATES',
          'The timetable has no date for the requested day; weekOneMonday is required.',
        );
      }
      return Math.floor((isoDateIndex(key) - isoDateIndex(options.weekOneMonday)) / 7) + 1;
    },
    weekdayAt(date) {
      return campusWeekday(date);
    },
    meetingsInWeek(week) {
      requirePositiveInteger(week, 'week');
      return timetable.meetings
        .filter((meeting) => meeting.weeks.includes(week))
        .sort(compareMeetings);
    },
    meetingsOnDay(week, weekday) {
      return meetingsOnDay(week, weekday);
    },
    meetingAt(week, weekday, period) {
      requirePositiveInteger(period, 'period');
      return (
        meetingsOnDay(week, weekday).find(
          (meeting) => meeting.startPeriod <= period && period <= meeting.endPeriod,
        ) ?? null
      );
    },
    occurrences() {
      return allOccurrences().map(copyOccurrence);
    },
    next(after = new Date()) {
      if (!Number.isFinite(after.getTime())) throw new TypeError('after must be valid.');
      const occurrence = allOccurrences().find(
        (candidate) => candidate.start.getTime() > after.getTime(),
      );
      return occurrence ? copyOccurrence(occurrence) : null;
    },
  };
}

const SEMESTER_ALIASES: Readonly<Record<string, string>> = {
  '1': '3',
  '2': '12',
  '3': '16',
};

export function findAcademicTerm(
  terms: readonly AcademicTerm[],
  selector?: string,
): AcademicTerm | null {
  const value = selector?.trim();
  if (!value) {
    const current = terms.filter((term) => term.current);
    return current.length === 1 ? (current[0] ?? null) : null;
  }

  const exact = terms.find((term) => `${term.academicYear}:${term.semester}` === value);
  if (exact) return exact;

  const match = /^(\d{4})[-/](\d+)$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const semester = SEMESTER_ALIASES[match[2]] ?? match[2];
  return terms.find((term) => term.academicYear === match[1] && term.semester === semester) ?? null;
}
