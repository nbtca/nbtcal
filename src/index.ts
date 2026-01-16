export { AuthService } from './auth/index.js';
export { ScheduleScraper } from './scraper/index.js';
export { ICSConverter } from './converter/index.js';
export { MailService } from './mailer/index.js';
export type * from './types.js';

import { AuthService } from './auth/index.js';
import { ScheduleScraper } from './scraper/index.js';
import { ICSConverter } from './converter/index.js';
import { MailService } from './mailer/index.js';
import type { Credentials, SemesterSelection, SMTPConfig } from './types.js';

export interface NbtcalOptions {
  credentials: Credentials;
  semester?: SemesterSelection;  // Optional, will auto-detect if not provided
  semesterStartDate: Date;
  email: string;
  smtp?: SMTPConfig;  // Optional, will use env vars if not provided
}

export async function nbtcal(options: NbtcalOptions): Promise<void> {
  console.log('NBT Course Schedule Exporter');
  console.log('============================\n');

  // Step 1: Authentication
  console.log('[1/5] Authenticating...');
  const auth = new AuthService(options.credentials);
  await auth.login();
  console.log('      ✓ Login successful\n');

  // Step 2: Navigate to schedule
  console.log('[2/5] Accessing schedule system...');
  await auth.navigateToSchedule();
  console.log('      ✓ Ready\n');

  // Step 3: Get semester and extract schedule
  console.log('[3/5] Fetching schedule data...');
  const scraper = new ScheduleScraper(auth.getClient());

  let semester = options.semester;
  if (!semester) {
    semester = await scraper.getCurrentSemester();
    console.log(`      Auto-detected semester: ${semester.academicYear} - ${semester.semester}`);
  }

  const courses = await scraper.extractSchedule(semester);
  console.log(`      ✓ Found ${courses.length} courses\n`);

  if (courses.length === 0) {
    throw new Error('No courses found. Please check your semester selection.');
  }

  // Step 4: Convert to ICS
  console.log('[4/5] Converting to ICS format...');
  const converter = new ICSConverter(options.semesterStartDate);
  const icsBuffer = converter.convert(courses);
  console.log(`      ✓ Generated ${icsBuffer.length} bytes\n`);

  // Step 5: Send email
  console.log('[5/5] Sending email...');
  const mailer = new MailService();
  await mailer.send({
    to: options.email,
    subject: 'Your Course Schedule',
    body: `Your course schedule for semester ${semester.academicYear}-${semester.semester} is attached.\n\nTotal courses: ${courses.length}\n\nImport the attached ICS file into your calendar application.`,
    attachment: icsBuffer,
    filename: 'schedule.ics',
    smtp: options.smtp
  });
  console.log('      ✓ Email sent\n');

  console.log('============================');
  console.log('Success! Check your email.');
}
