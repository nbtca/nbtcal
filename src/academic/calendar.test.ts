import { describe, expect, it } from 'vitest';
import { createCalendar } from '../calendar.js';
import { parseCalendar } from '../parse.js';
import { createStudentExamCalendar, studentExamsToIcs } from './calendar.js';
import type { StudentExam, StudentExamRecords } from './types.js';

function exam(overrides: Partial<StudentExam> = {}): StudentExam {
  return {
    courseCode: 'COURSE-A',
    courseName: 'Algorithms',
    examName: 'Final',
    timeText: '2026-12-10(09:00-11:00)',
    start: new Date('2026-12-10T01:00:00Z'),
    end: new Date('2026-12-10T03:00:00Z'),
    location: 'A101',
    campus: 'Main campus',
    seat: '08',
    assessment: 'Written',
    ...overrides,
  };
}
function records(items: StudentExam[]): StudentExamRecords {
  return {
    kind: 'exams',
    term: { academicYear: '2026', semester: '3' },
    items,
    fetchedAt: new Date('2026-10-01T00:00:00Z'),
  };
}

describe('student exam calendar', () => {
  it('converts exams to the shared calendar model and exposes unscheduled exams separately', () => {
    const data = records([
      exam(),
      exam({ courseCode: 'COURSE-B', start: null, end: null, timeText: '未放开不可查' }),
    ]);
    const calendar = createStudentExamCalendar(data);
    expect(calendar.events).toHaveLength(1);
    expect(calendar.events[0]).toMatchObject({
      title: '考试：Algorithms',
      start: new Date('2026-12-10T01:00:00Z'),
      end: new Date('2026-12-10T03:00:00Z'),
      isAllDay: false,
      recurring: false,
      location: 'Main campus · A101',
    });
    expect(calendar.events[0]?.description).toContain('座位号：08');
    expect(calendar.unscheduled).toHaveLength(1);
    expect(calendar.unscheduled[0]?.timeText).toBe('未放开不可查');
    const event = calendar.events[0]!;
    event.start.setUTCFullYear(2000);
    expect(data.items[0]?.start?.getUTCFullYear()).toBe(2026);
  });

  it('keeps UIDs stable across input order, room and time corrections and removes duplicate rows', () => {
    const firstExam = exam();
    const other = exam({ courseCode: 'COURSE-B', courseName: 'Networks' });
    const first = createStudentExamCalendar(records([firstExam, other, { ...firstExam }]));
    const changed = createStudentExamCalendar(
      records([
        other,
        exam({
          location: 'B202',
          start: new Date('2026-12-11T01:00:00Z'),
          end: new Date('2026-12-11T03:00:00Z'),
        }),
      ]),
    );
    expect(first.events).toHaveLength(2);
    expect(first.events.find((event) => event.title === '考试：Algorithms')?.uid).toBe(
      changed.events.find((event) => event.title === '考试：Algorithms')?.uid,
    );
    expect(first.events.map((event) => event.uid)).not.toContain('COURSE-A');
  });

  it('retains distinct exams for the same course without mutating the input order', () => {
    const later = exam({
      start: new Date('2026-12-11T01:00:00Z'),
      end: new Date('2026-12-11T03:00:00Z'),
    });
    const data = records([later, exam()]);
    const converted = createStudentExamCalendar(data);
    expect(new Set(converted.events.map((event) => event.uid)).size).toBe(2);
    expect(data.items[0]).toBe(later);
    expect(converted.events[0]?.start.getTime()).toBeLessThan(converted.events[1]!.start.getTime());
  });

  it.each([new Date(NaN), new Date('2026-12-10T00:00:00Z')])(
    'rejects invalid concrete end times',
    (end) => {
      expect(() => createStudentExamCalendar(records([exam({ end })]))).toThrow(
        /invalid start or end/,
      );
    },
  );

  it('refuses to silently export a partial schedule when exam times are unpublished', () => {
    expect(() => studentExamsToIcs(records([exam(), exam({ start: null, end: null })]))).toThrow(
      expect.objectContaining({ code: 'UNPUBLISHED_EXAM_TIME' }),
    );
  });

  it('exports private ICS usable by the existing calendar queries in any host time zone', () => {
    const data = records([
      exam({ courseName: '高级程序设计，实验；专题'.repeat(8), location: 'A,101\nRoom' }),
      exam({
        courseCode: 'COURSE-B',
        examName: 'Resit',
        start: new Date('2026-12-11T01:00:00Z'),
        end: new Date('2026-12-11T03:00:00Z'),
      }),
    ]);
    const ics = studentExamsToIcs(data, { now: new Date('2026-10-01T00:00:00Z') });
    expect(ics.match(/CLASS:PRIVATE/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261210T010000Z');
    expect(ics).toContain('LOCATION:Main campus · A\\,101\\nRoom');
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
      true,
    );
    const calendar = createCalendar(parseCalendar(ics));
    const upcoming = calendar.inRange(
      new Date('2026-12-10T00:00:00Z'),
      new Date('2026-12-12T00:00:00Z'),
    );
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0]?.start.toISOString()).toBe('2026-12-10T01:00:00.000Z');
  });

  it('exports an empty published schedule as a valid empty calendar', () => {
    expect(parseCalendar(studentExamsToIcs(records([]))).vevents).toHaveLength(0);
  });
});
