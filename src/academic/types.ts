import type { AcademicTermRef, TimetableRequestOptions } from '../timetable/types.js';

export type StudentRecordsKind = 'exams' | 'grades';

export interface StudentExam {
  courseCode: string | null;
  courseName: string;
  examName: string | null;
  timeText: string | null;
  start: Date | null;
  end: Date | null;
  location: string | null;
  campus: string | null;
  seat: string | null;
  assessment: string | null;
}

export interface StudentGrade {
  courseCode: string | null;
  courseName: string;
  grade: string | null;
  credits: number | null;
  gradePoint: number | null;
  courseNature: string | null;
  examNature: string | null;
  remark: string | null;
  voided: boolean | null;
}

export type StudentRecords = {
  term: AcademicTermRef;
  fetchedAt: Date;
} & (
  | { kind: 'exams'; items: readonly StudentExam[] }
  | { kind: 'grades'; items: readonly StudentGrade[] }
);

export type StudentExamRecords = Extract<StudentRecords, { kind: 'exams' }>;
export type StudentGradeRecords = Extract<StudentRecords, { kind: 'grades' }>;

export type StudentRecordsErrorCode =
  | 'SESSION_EXPIRED'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RECORDS'
  | 'TERM_MISMATCH'
  | 'UNPUBLISHED_EXAM_TIME';

export class StudentRecordsError extends Error {
  constructor(
    readonly code: StudentRecordsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StudentRecordsError';
  }
}

export interface CreateNbtStudentRecordsClientOptions {
  baseUrl: string | URL;
  now?: () => Date;
}

export interface NbtStudentRecordsClient {
  fetchRecords(
    kind: 'exams',
    term: AcademicTermRef,
    options?: TimetableRequestOptions,
  ): Promise<StudentExamRecords>;
  fetchRecords(
    kind: 'grades',
    term: AcademicTermRef,
    options?: TimetableRequestOptions,
  ): Promise<StudentGradeRecords>;
  fetchRecords(
    kind: StudentRecordsKind,
    term: AcademicTermRef,
    options?: TimetableRequestOptions,
  ): Promise<StudentRecords>;
}
