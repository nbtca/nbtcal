export { AuthService } from './auth/index.js';
export { ScheduleScraper } from './scraper/index.js';
export { ICSConverter } from './converter/index.js';
export { MailService } from './mailer/index.js';
export type * from './types.js';

import { AuthService } from './auth/index.js';
import { ScheduleScraper } from './scraper/index.js';
import { ICSConverter } from './converter/index.js';
import { MailService } from './mailer/index.js';
import { getMessages } from './i18n.js';
import type { Credentials, SemesterSelection, SMTPConfig } from './types.js';

export interface NbtcalOptions {
  credentials: Credentials;
  semester?: SemesterSelection;  // Optional, will auto-detect if not provided
  semesterStartDate: Date;
  email: string;
  smtp?: SMTPConfig;  // Optional, will use env vars if not provided
}

export async function nbtcal(options: NbtcalOptions): Promise<void> {
  const msg = getMessages();

  console.log('NBT Course Schedule Exporter');
  console.log('============================\n');

  // Step 1: Authentication
  console.log(msg.step1Authenticating);
  const auth = new AuthService(options.credentials);
  await auth.login();
  console.log(msg.step1Success);

  // Step 2: Navigate to schedule
  console.log(msg.step2Accessing);
  await auth.navigateToSchedule();
  console.log(msg.step2Success);

  // Step 3: Get semester and extract schedule
  console.log(msg.step3Fetching);
  const scraper = new ScheduleScraper(auth.getClient());

  let semester = options.semester;
  if (!semester) {
    semester = await scraper.getCurrentSemester();
    console.log(`${msg.step3AutoDetected}${semester.academicYear} - ${semester.semester}`);
  }

  const courses = await scraper.extractSchedule(semester);
  console.log(`${msg.step3FoundCourses}${courses.length} courses\n`);

  if (courses.length === 0) {
    throw new Error(msg.noCourses);
  }

  // Step 4: Convert to ICS
  console.log(msg.step4Converting);
  const converter = new ICSConverter(options.semesterStartDate);
  const icsBuffer = converter.convert(courses);
  console.log(`${msg.step4Generated}${icsBuffer.length} bytes\n`);

  // Step 5: Send email
  console.log(msg.step5Sending);
  const mailer = new MailService();
  await mailer.send({
    to: options.email,
    subject: 'Your Course Schedule',
    body: `Your course schedule for semester ${semester.academicYear}-${semester.semester} is attached.\n\nTotal courses: ${courses.length}\n\nImport the attached ICS file into your calendar application.`,
    attachment: icsBuffer,
    filename: 'schedule.ics',
    smtp: options.smtp
  });
  console.log(msg.step5Success);

  console.log('============================');
  console.log(msg.finalSuccess);
}
