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

export type EmailMode = 'api' | 'smtp';

export interface APIConfig {
  url: string;
  apiKey?: string;
  timeout?: number;
}

export interface EmailConfig {
  to: string;
  subject: string;
  body: string;
  attachment: Buffer;
  filename: string;
  smtp?: SMTPConfig;
  api?: APIConfig;
  mode?: EmailMode;
}

export interface SendCalendarResponse {
  success: boolean;
  messageId?: string;
  sentAt?: string;
  error?: {
    code: string;
    message: string;
    retryAfter?: number;
  };
}
