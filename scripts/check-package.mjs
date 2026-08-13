import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'nbtcal-package-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_dry_run: 'false',
      npm_config_fund: 'false',
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

try {
  run('npm', ['pack', '--pack-destination', temporaryDirectory], root);
  const tarballs = (await readdir(temporaryDirectory)).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error('npm pack did not produce exactly one tarball');

  await writeFile(
    join(temporaryDirectory, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
    }),
  );
  await writeFile(
    join(temporaryDirectory, 'smoke.mjs'),
    [
      "import { FeedFetchError, FeedParseError, currentAcademicWindow, eventToICS, findBreakEvents, inferWeekOneMonday, isAcademicBreakEvent, loadCalendar } from '@nbtca/nbtcal';",
      "import { TimetableError, campusWeekday, createNbtTimetableClient, createTimetableSchedule, findAcademicTerm, parseWeekExpression, timetableToIcs } from '@nbtca/nbtcal/timetable';",
      '',
      'const assert = (condition, message) => { if (!condition) throw new TypeError(message); };',
      "const calendarSource = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:semester-start', 'SUMMARY:[NBT] 秋季学期开始上课', 'DTSTART;VALUE=DATE:20260907', 'DTEND;VALUE=DATE:20260908', 'END:VEVENT', 'END:VCALENDAR'].join('\\r\\n');",
      'const originalFetch = globalThis.fetch;',
      'globalThis.fetch = async () => new Response(calendarSource, { status: 200 });',
      'let calendar;',
      'try {',
      "  calendar = await loadCalendar({ url: 'https://calendar.example/feed.ics', timeoutMs: 1000 });",
      '} finally {',
      '  globalThis.fetch = originalFetch;',
      '}',
      "const events = calendar.inRange(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'));",
      "assert(events.length === 1, 'loadCalendar did not produce a usable Calendar');",
      "assert(eventToICS(events[0], { now: new Date('2026-08-01T00:00:00Z') }).includes('UID:semester-start'), 'eventToICS failed');",
      "assert(new FeedFetchError('fetch').name === 'FeedFetchError', 'invalid FeedFetchError export');",
      "assert(new FeedParseError('parse').name === 'FeedParseError', 'invalid FeedParseError export');",
      "const academicWindow = currentAcademicWindow(events, new Date('2026-09-21T00:00:00Z'));",
      "assert(academicWindow?.status === 'inTerm', 'currentAcademicWindow failed');",
      "assert(inferWeekOneMonday(events, new Date('2026-09-21T00:00:00Z')) === '2026-09-07', 'inferWeekOneMonday failed');",
      "const breakEvent = { ...events[0], uid: 'summer-break', title: '[NBT] 暑期', start: new Date(2026, 6, 1), end: new Date(2026, 6, 5) };",
      "assert(isAcademicBreakEvent(breakEvent), 'isAcademicBreakEvent failed');",
      "assert(findBreakEvents([events[0], breakEvent]).length === 1, 'findBreakEvents failed');",
      '',
      'const termCatalog = \'<select id="xnm"><option value="2026" selected>2026-2027</option></select><select id="xqm"><option value="3" selected>First semester</option></select>\';',
      'const transport = async (url) => ({ status: 200, url: url.href, text: async () => termCatalog });',
      "const client = createNbtTimetableClient(transport, { baseUrl: 'https://jwxt.example' });",
      'const terms = await client.listTerms();',
      "assert(findAcademicTerm(terms)?.semester === '3', 'timetable client or findAcademicTerm failed');",
      "assert(new TimetableError('SESSION_EXPIRED', 'expired').code === 'SESSION_EXPIRED', 'invalid TimetableError export');",
      "assert(campusWeekday(new Date('2026-09-06T16:00:00Z')) === 1, 'invalid campus weekday');",
      "assert(parseWeekExpression('1-2周').join(',') === '1,2', 'invalid week parser');",
      "const timetable = { term: { academicYear: '2026', semester: '3' }, meetings: [{ sourceId: 'class-a', courseName: 'Algorithms', teacherNames: ['Teacher'], location: 'A101', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' }], untimedCourses: [], unresolvedItems: [], periods: [{ period: 1, label: 'First', start: '08:00', end: '08:45' }], calendarDays: [], warnings: [], fetchedAt: new Date('2026-08-01T00:00:00Z') };",
      "const schedule = createTimetableSchedule(timetable, { weekOneMonday: '2026-09-07' });",
      "assert(schedule.occurrences()[0]?.meeting.courseName === 'Algorithms', 'createTimetableSchedule failed');",
      "assert(timetableToIcs(timetable, { weekOneMonday: '2026-09-07', generatedAt: new Date('2026-08-01T00:00:00Z') }).includes('BEGIN:VEVENT'), 'timetableToIcs failed');",
    ].join('\n'),
  );
  await writeFile(
    join(temporaryDirectory, 'consumer.ts'),
    [
      "import { FeedFetchError, FeedParseError, currentAcademicWindow, eventToICS, findBreakEvents, inferWeekOneMonday, isAcademicBreakEvent, loadCalendar, type AcademicWindow, type Calendar, type CalendarEvent, type EventToICSOptions, type HeatmapBucket, type LoadCalendarOptions, type OnBreak } from '@nbtca/nbtcal';",
      "import { TimetableError, campusWeekday, createNbtTimetableClient, createTimetableSchedule, findAcademicTerm, timetableToIcs, type AcademicTerm, type AuthenticatedTransport, type CreateNbtTimetableClientOptions, type NbtTimetableClient, type Timetable, type TimetableErrorCode, type TimetableMeeting, type TimetableOccurrence, type TimetablePeriod, type TimetableSchedule, type TimetableScheduleOptions, type TimetableToIcsOptions, type TimetableUntimedCourse, type TimetableUnresolvedItem, type TransportResponse, type Weekday } from '@nbtca/nbtcal/timetable';",
      '',
      "const event: CalendarEvent = { uid: 'event-a', title: '[NBT] 暑期', start: new Date(2026, 6, 1), end: new Date(2026, 6, 5), isAllDay: true, location: null, description: null, recurring: false };",
      "const loadOptions: LoadCalendarOptions = { url: 'https://calendar.example/feed.ics', timeoutMs: 1000 };",
      'const calendarPromise: Promise<Calendar> = loadCalendar(loadOptions);',
      "const eventOptions: EventToICSOptions = { now: new Date('2026-08-01T00:00:00Z') };",
      'const eventIcs: string = eventToICS(event, eventOptions);',
      'const academicWindow: AcademicWindow | OnBreak | null = currentAcademicWindow([event], new Date());',
      'const weekOneMonday: string | null = inferWeekOneMonday([event], new Date());',
      'const academicBreak: boolean = isAcademicBreakEvent(event);',
      'const breakEvents: CalendarEvent[] = findBreakEvents([event]);',
      "const heatmapBucket: HeatmapBucket = { date: '2026-07-01', count: 1 };",
      "const feedErrors: readonly Error[] = [new FeedFetchError('fetch'), new FeedParseError('parse')];",
      '',
      "const term: AcademicTerm = { academicYear: '2026', semester: '3', academicYearLabel: '2026-2027', semesterLabel: 'First semester', current: true };",
      "const meeting: TimetableMeeting = { sourceId: 'class-a', courseName: 'Algorithms', teacherNames: ['Teacher'], location: 'A101', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' };",
      "const period: TimetablePeriod = { period: 1, label: 'First', start: '08:00', end: '08:45' };",
      "const untimedCourse: TimetableUntimedCourse = { sourceId: null, courseName: 'Practice course', teacherNames: [], campus: null, location: null, weeks: [1], kind: 'practice' };",
      "const unresolvedItem: TimetableUnresolvedItem = { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Unresolved practice' } };",
      "const timetable: Timetable = { term, meetings: [meeting], untimedCourses: [untimedCourse], unresolvedItems: [unresolvedItem], periods: [period], calendarDays: [], warnings: [], fetchedAt: new Date('2026-08-01T00:00:00Z') };",
      "const scheduleOptions: TimetableScheduleOptions = { weekOneMonday: '2026-09-07' };",
      'const schedule: TimetableSchedule = createTimetableSchedule(timetable, scheduleOptions);',
      "const occurrence: TimetableOccurrence | null = schedule.next(new Date('2026-09-01T00:00:00Z'));",
      "const weekday: Weekday = campusWeekday(new Date('2026-09-06T16:00:00Z'));",
      "const timetableIcsOptions: TimetableToIcsOptions = { weekOneMonday: '2026-09-07' };",
      'const timetableIcs: string = timetableToIcs(timetable, timetableIcsOptions);',
      'const selectedTerm: AcademicTerm | null = findAcademicTerm([term]);',
      "const response: TransportResponse = { status: 200, url: 'https://jwxt.example', text: async () => '' };",
      'const transport: AuthenticatedTransport = async () => response;',
      "const clientOptions: CreateNbtTimetableClientOptions = { baseUrl: 'https://jwxt.example' };",
      'const client: NbtTimetableClient = createNbtTimetableClient(transport, clientOptions);',
      "const timetableErrorCode: TimetableErrorCode = 'SESSION_EXPIRED';",
      "const timetableError: TimetableError = new TimetableError(timetableErrorCode, 'expired');",
      '',
      'export const consumerContract = { academicBreak, academicWindow, breakEvents, calendarPromise, client, eventIcs, feedErrors, heatmapBucket, occurrence, selectedTerm, timetableError, timetableIcs, weekday, weekOneMonday };',
    ].join('\n'),
  );

  run(
    'npm',
    ['install', '--ignore-scripts', join(temporaryDirectory, tarballs[0])],
    temporaryDirectory,
  );
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--exactOptionalPropertyTypes',
      '--noUncheckedIndexedAccess',
      '--noUnusedLocals',
      '--noUnusedParameters',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--verbatimModuleSyntax',
      'consumer.ts',
    ],
    temporaryDirectory,
  );
  run(process.execPath, ['smoke.mjs'], temporaryDirectory);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
