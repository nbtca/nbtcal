import type { CalendarEvent } from '../types.js';
import { stableHash } from '../identity.js';
import { eventsToICS, type EventToICSOptions } from '../serialize.js';
import { StudentRecordsError, type StudentExam, type StudentExamRecords } from './types.js';

export interface StudentExamCalendar {
  events: CalendarEvent[];
  unscheduled: StudentExam[];
}

export type StudentExamsToIcsOptions = Pick<EventToICSOptions, 'now' | 'calendarName'>;

function copyExam(exam: StudentExam): StudentExam {
  return {
    courseCode: exam.courseCode,
    courseName: exam.courseName,
    examName: exam.examName,
    timeText: exam.timeText,
    location: exam.location,
    campus: exam.campus,
    seat: exam.seat,
    assessment: exam.assessment,
    start: exam.start ? new Date(exam.start) : null,
    end: exam.end ? new Date(exam.end) : null,
  };
}

export function createStudentExamCalendar(records: StudentExamRecords): StudentExamCalendar {
  const events: CalendarEvent[] = [];
  const unscheduled: StudentExam[] = [];
  const groups = new Map<string, { exam: StudentExam; serialized: string }[]>();
  for (const item of records.items) {
    const exam = copyExam(item);
    const key = JSON.stringify([
      records.term.academicYear,
      records.term.semester,
      exam.courseCode ?? exam.courseName,
      exam.examName,
      exam.assessment,
    ]);
    const group = groups.get(key) ?? [];
    group.push({ exam, serialized: JSON.stringify(exam) });
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    group.sort(
      (a, b) =>
        (a.exam.start?.getTime() ?? Infinity) - (b.exam.start?.getTime() ?? Infinity) ||
        a.serialized.localeCompare(b.serialized),
    );
    const seen = new Set<string>();
    let occurrence = 0;
    for (const { exam, serialized: duplicateKey } of group) {
      if (seen.has(duplicateKey)) continue;
      seen.add(duplicateKey);
      if (!exam.start || !exam.end) {
        unscheduled.push(copyExam(exam));
        continue;
      }
      if (
        !Number.isFinite(exam.start.getTime()) ||
        !Number.isFinite(exam.end.getTime()) ||
        exam.end <= exam.start
      ) {
        throw new StudentRecordsError('INVALID_RECORDS', 'An exam has invalid start or end times.');
      }
      const description = [
        exam.examName,
        exam.seat ? `座位号：${exam.seat}` : null,
        exam.assessment,
      ]
        .filter(Boolean)
        .join('\n');
      events.push({
        uid: `nbt-exam-${stableHash(`${key}:${occurrence}`)}@calendar.nbtca.space`,
        title: `考试：${exam.courseName}`,
        start: new Date(exam.start),
        end: new Date(exam.end),
        isAllDay: false,
        location: [exam.campus, exam.location].filter(Boolean).join(' · ') || null,
        description: description || null,
        recurring: false,
      });
      occurrence += 1;
    }
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.uid.localeCompare(b.uid));
  return { events, unscheduled };
}

export function studentExamsToIcs(
  records: StudentExamRecords,
  options: StudentExamsToIcsOptions = {},
): string {
  const calendar = createStudentExamCalendar(records);
  if (calendar.unscheduled.length > 0) {
    throw new StudentRecordsError(
      'UNPUBLISHED_EXAM_TIME',
      'Some exams have no published time; a complete exam calendar cannot be exported.',
    );
  }
  return eventsToICS(calendar.events, {
    ...options,
    classification: 'PRIVATE',
    calendarName: options.calendarName ?? '我的考试安排',
  });
}
