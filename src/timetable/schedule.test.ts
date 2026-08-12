import { describe, expect, it } from 'vitest';
import {
  campusWeekday,
  createTimetableSchedule,
  findAcademicTerm,
  type AcademicTerm,
  type Timetable,
  type TimetableMeeting,
} from './index.js';

describe('campusWeekday', () => {
  it('uses the Asia/Shanghai calendar day at UTC boundaries', () => {
    expect(campusWeekday(new Date('2026-09-06T15:59:59Z'))).toBe(7);
    expect(campusWeekday(new Date('2026-09-06T16:00:00Z'))).toBe(1);
  });

  it('rejects invalid dates', () => {
    expect(() => campusWeekday(new Date(Number.NaN))).toThrow(TypeError);
  });
});

function meeting(overrides: Partial<TimetableMeeting> = {}): TimetableMeeting {
  return {
    sourceId: null,
    courseName: 'Algorithms',
    teacherNames: [],
    location: null,
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1],
    kind: 'regular',
    ...overrides,
  };
}

function timetable(): Timetable {
  return {
    term: { academicYear: '2026', semester: '3' },
    meetings: [
      meeting({ courseName: 'Networks', weekday: 2, startPeriod: 3, endPeriod: 3 }),
      meeting(),
    ],
    unresolvedItems: [],
    periods: [
      { period: 1, label: null, start: '08:00', end: '08:45' },
      { period: 2, label: null, start: '08:55', end: '09:40' },
      { period: 3, label: null, start: '10:00', end: '10:45' },
    ],
    calendarDays: [],
    warnings: [],
    fetchedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

describe('createTimetableSchedule', () => {
  it('resolves teaching weeks and weekdays in the campus time zone', () => {
    const schedule = createTimetableSchedule(timetable(), { weekOneMonday: '2026-09-07' });
    expect(schedule.weekAt(new Date('2026-09-06T16:00:00Z'))).toBe(1);
    expect(schedule.weekAt(new Date('2026-09-13T16:00:00Z'))).toBe(2);
    expect(schedule.weekAt(new Date('2026-09-06T15:59:59Z'))).toBe(0);
    expect(schedule.weekdayAt(new Date('2026-09-12T16:00:00Z'))).toBe(7);
    expect(schedule.weekdayAt(new Date('2026-09-06T16:00:00Z'))).toBe(
      campusWeekday(new Date('2026-09-06T16:00:00Z')),
    );
  });

  it('queries sorted meetings without mutating the timetable', () => {
    const value = timetable();
    const original = [...value.meetings];
    const schedule = createTimetableSchedule(value, { weekOneMonday: '2026-09-07' });

    expect(schedule.meetingsInWeek(1).map((item) => item.courseName)).toEqual([
      'Algorithms',
      'Networks',
    ]);
    expect(schedule.meetingsOnDay(1, 2).map((item) => item.courseName)).toEqual(['Networks']);
    expect(schedule.meetingAt(1, 1, 2)?.courseName).toBe('Algorithms');
    expect(schedule.meetingAt(1, 1, 3)).toBeNull();
    expect(value.meetings).toEqual(original);
  });

  it('expands occurrences and returns the next class as an instant', () => {
    const schedule = createTimetableSchedule(timetable(), { weekOneMonday: '2026-09-07' });
    const occurrences = schedule.occurrences();

    expect(occurrences.map((item) => `${item.date} ${item.startTime}-${item.endTime}`)).toEqual([
      '2026-09-07 08:00-09:40',
      '2026-09-08 10:00-10:45',
    ]);
    expect(occurrences[0]?.start.toISOString()).toBe('2026-09-07T00:00:00.000Z');
    expect(schedule.next(new Date('2026-09-07T00:00:00Z'))?.meeting.courseName).toBe('Networks');
    expect(schedule.next(new Date('2026-09-08T02:00:00Z'))).toBeNull();
  });

  it('prefers authoritative dates and can use them without a fallback Monday', () => {
    const value = timetable();
    value.meetings = [meeting()];
    value.calendarDays = [{ week: 1, weekday: 1, date: '2026-09-14' }];
    const schedule = createTimetableSchedule(value);

    expect(schedule.weekAt(new Date('2026-09-13T16:00:00Z'))).toBe(1);
    expect(schedule.occurrences()[0]?.date).toBe('2026-09-14');
  });

  it('fills gaps in an incomplete authoritative date map from week one', () => {
    const value = timetable();
    value.calendarDays = [{ week: 1, weekday: 1, date: '2026-09-14' }];
    const schedule = createTimetableSchedule(value, { weekOneMonday: '2026-09-14' });

    expect(schedule.occurrences().map((occurrence) => occurrence.date)).toEqual([
      '2026-09-14',
      '2026-09-15',
    ]);
    expect(schedule.weekAt(new Date('2026-09-20T16:00:00Z'))).toBe(2);
  });

  it('rejects authoritative dates that disagree with the fallback week basis', () => {
    const value = timetable();
    value.calendarDays = [{ week: 1, weekday: 1, date: '2026-09-14' }];

    expect(() => createTimetableSchedule(value, { weekOneMonday: '2026-09-07' })).toThrowError(
      expect.objectContaining({ code: 'MISSING_CALENDAR_DATES' }),
    );
  });

  it('keeps meetingAt valid when the method is detached', () => {
    const { meetingAt } = createTimetableSchedule(timetable(), {
      weekOneMonday: '2026-09-07',
    });
    expect(meetingAt(1, 1, 2)?.courseName).toBe('Algorithms');
  });

  it('returns fresh occurrence arrays and rejects incomplete date or period data', () => {
    const schedule = createTimetableSchedule(timetable(), { weekOneMonday: '2026-09-07' });
    schedule.occurrences().pop();
    expect(schedule.occurrences()).toHaveLength(2);

    expect(() =>
      createTimetableSchedule(timetable(), { weekOneMonday: '2026-09-08' }),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_CALENDAR_DATES' }));
    expect(() => createTimetableSchedule(timetable()).occurrences()).toThrowError(
      expect.objectContaining({ code: 'MISSING_CALENDAR_DATES' }),
    );

    const missingPeriod = timetable();
    missingPeriod.periods = [];
    expect(() =>
      createTimetableSchedule(missingPeriod, { weekOneMonday: '2026-09-07' }).occurrences(),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_PERIOD_TIME' }));
  });

  it('does not expose mutable occurrence dates from its cache', () => {
    const schedule = createTimetableSchedule(timetable(), { weekOneMonday: '2026-09-07' });
    const occurrences = schedule.occurrences();
    const first = occurrences[0];
    expect(first).toBeDefined();
    first?.start.setUTCFullYear(2099);
    first?.end.setUTCFullYear(2099);

    const fresh = schedule.occurrences()[0];
    expect(fresh).not.toBe(first);
    expect(fresh?.start).not.toBe(first?.start);
    expect(fresh?.start.toISOString()).toBe('2026-09-07T00:00:00.000Z');
    expect(fresh?.end.toISOString()).toBe('2026-09-07T01:40:00.000Z');

    const next = schedule.next(new Date('2026-09-06T00:00:00Z'));
    expect(next).not.toBeNull();
    next?.start.setUTCFullYear(2099);
    next?.end.setUTCFullYear(2099);
    expect(schedule.next(new Date('2026-09-06T00:00:00Z'))?.start.toISOString()).toBe(
      '2026-09-07T00:00:00.000Z',
    );
  });
});

describe('findAcademicTerm', () => {
  const terms: AcademicTerm[] = [
    {
      academicYear: '2025',
      semester: '12',
      academicYearLabel: '2025-2026',
      semesterLabel: 'Second semester',
      current: false,
    },
    {
      academicYear: '2026',
      semester: '3',
      academicYearLabel: '2026-2027',
      semesterLabel: 'First semester',
      current: true,
    },
  ];

  it('finds the sole current term, opaque codes and display aliases', () => {
    expect(findAcademicTerm(terms)?.academicYear).toBe('2026');
    expect(findAcademicTerm(terms, '2025:12')?.semester).toBe('12');
    expect(findAcademicTerm(terms, '2026-1')?.semester).toBe('3');
    expect(findAcademicTerm(terms, '2025/2')?.semester).toBe('12');
  });

  it('returns null for unknown or ambiguous selections', () => {
    expect(findAcademicTerm(terms, '2024-1')).toBeNull();
    expect(
      findAcademicTerm(
        [
          {
            ...terms[0]!,
            academicYear: '2026',
            semester: '16',
          },
        ],
        '2026:3',
      ),
    ).toBeNull();
    expect(findAcademicTerm(terms.map((term) => ({ ...term, current: false })))).toBeNull();
    expect(findAcademicTerm(terms.map((term) => ({ ...term, current: true })))).toBeNull();
  });
});
