import { describe, expect, it } from 'vitest';
import { parseCalendar } from '../parse.js';
import { timetableToIcs } from './ics.js';
import { type Timetable } from './types.js';

function fixture(): Timetable {
  return {
    term: { academicYear: '2026', semester: '3' },
    meetings: [{
      sourceId: 'teaching-class-a',
      courseName: '高级程序设计，实验；专题',
      teacherNames: ['教师甲'],
      location: '教学楼 A,101',
      weekday: 1,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1, 3],
      kind: 'regular',
    }],
    unresolvedItems: [],
    periods: [
      { period: 1, label: '第一节', start: '08:00', end: '08:45' },
      { period: 2, label: '第二节', start: '08:50', end: '09:35' },
    ],
    calendarDays: [],
    warnings: [],
    fetchedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

describe('timetableToIcs', () => {
  it('emits one stable event per concrete teaching week', () => {
    const options = {
      weekOneMonday: '2026-09-07',
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    };
    const first = timetableToIcs(fixture(), options);
    const second = timetableToIcs(fixture(), options);
    expect(first).toBe(second);
    expect(first.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(first).toContain('DTSTART;TZID=Asia/Shanghai:20260907T080000');
    expect(first).toContain('DTSTART;TZID=Asia/Shanghai:20260921T080000');
    expect(first).toContain('SUMMARY:高级程序设计\\，实验\\；专题'.replace(/\\，/g, '，').replace(/\\；/g, '；'));
    expect(first).toContain('LOCATION:教学楼 A\\,101');
    expect(first).toContain('CLASS:PRIVATE');
    expect(first).not.toMatch(/student|学号/i);

    const parsed = parseCalendar(first);
    expect(parsed.vevents).toHaveLength(2);
    expect(new Set(parsed.vevents.map((event) => event.uid)).size).toBe(2);
  });

  it('prefers authoritative calendar dates over fallback arithmetic', () => {
    const timetable = fixture();
    timetable.calendarDays = [{ week: 1, weekday: 1, date: '2026-09-14' }];
    timetable.meetings = [{ ...timetable.meetings[0]!, weeks: [1] }];
    const ics = timetableToIcs(timetable, {
      weekOneMonday: '2026-09-07',
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    });
    expect(ics).toContain('DTSTART;TZID=Asia/Shanghai:20260914T080000');
  });

  it('keeps UIDs stable across corrected dates and rooms and removes duplicate rows', () => {
    const original = fixture();
    original.meetings = [{ ...original.meetings[0]!, weeks: [1] }];
    const corrected = fixture();
    corrected.meetings = [
      { ...corrected.meetings[0]!, location: '新教室', weeks: [1] },
      { ...corrected.meetings[0]!, location: '新教室', weeks: [1] },
    ];
    const first = timetableToIcs(original, {
      weekOneMonday: '2026-09-07',
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    });
    const second = timetableToIcs(corrected, {
      weekOneMonday: '2026-09-14',
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    });
    const uid = (ics: string) => /^UID:(.+)$/m.exec(ics)?.[1]?.trim();
    expect(uid(second)).toBe(uid(first));
    expect(second.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('folds every physical content line at 75 UTF-8 octets or fewer', () => {
    const timetable = fixture();
    timetable.meetings = [{
      ...timetable.meetings[0]!,
      courseName: '非常长的中文课程名称'.repeat(10),
      weeks: [1],
    }];
    const ics = timetableToIcs(timetable, {
      weekOneMonday: '2026-09-07',
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    });
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('escapes ASCII TEXT delimiters, backslashes and newlines', () => {
    const timetable = fixture();
    timetable.meetings = [{
      ...timetable.meetings[0]!,
      courseName: 'A\\B,C;D\nE',
      weeks: [1],
    }];
    const ics = timetableToIcs(timetable, {
      weekOneMonday: '2026-09-07',
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    });
    expect(ics).toContain('SUMMARY:A\\\\B\\,C\\;D\\nE');
  });

  it('requires a date source and complete period mapping', () => {
    expect(() => timetableToIcs(fixture(), {
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    })).toThrowError(expect.objectContaining({ code: 'MISSING_CALENDAR_DATES' }));

    const timetable = fixture();
    timetable.periods = [];
    expect(() => timetableToIcs(timetable, {
      weekOneMonday: '2026-09-07',
      generatedAt: new Date('2026-08-01T00:00:00Z'),
    })).toThrowError(expect.objectContaining({ code: 'MISSING_PERIOD_TIME' }));

    expect(() => timetableToIcs(fixture(), {
      weekOneMonday: '2026-09-08',
    })).toThrowError(expect.objectContaining({ code: 'MISSING_CALENDAR_DATES' }));

    expect(() => timetableToIcs(fixture(), {
      weekOneMonday: '2026-09-07',
      uidDomain: 'safe.example\r\nX-INJECTED:YES',
    })).toThrow(TypeError);

    expect(() => timetableToIcs(fixture(), {
      weekOneMonday: '2026-09-07',
      periodTimes: { 1: { start: '09:00', end: '08:00' } },
    })).toThrowError(expect.objectContaining({ code: 'MISSING_PERIOD_TIME' }));
  });
});
