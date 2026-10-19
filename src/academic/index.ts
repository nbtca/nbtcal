export { createNbtStudentRecordsClient } from './client.js';
export { STUDENT_RECORD_ROUTES } from './routes.js';
export { StudentRecordsError } from './types.js';
export type {
  StudentExam,
  StudentGrade,
  StudentRecords,
  StudentRecordsKind,
  StudentExamRecords,
  StudentGradeRecords,
  StudentRecordsErrorCode,
  NbtStudentRecordsClient,
  CreateNbtStudentRecordsClientOptions,
} from './types.js';
export { createStudentExamCalendar, studentExamsToIcs } from './calendar.js';
export type { StudentExamCalendar, StudentExamsToIcsOptions } from './calendar.js';
