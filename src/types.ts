export interface Credentials {
  username: string;
  password: string;
}

export interface SemesterSelection {
  academicYear: string;
  semester: string;
}

export interface CourseSchedule {
  name: string;
  teacher: string;
  location: string;
  weekday: number;
  startTime: string;
  endTime: string;
  weeks: number[];
  courseType?: string;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface EmailConfig {
  to: string;
  subject: string;
  body: string;
  attachment: Buffer;
  filename: string;
  smtp?: SMTPConfig;
}
