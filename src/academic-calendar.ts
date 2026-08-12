import type { CalendarEvent } from './types.js';

const DAY_MS = 86400000;

function institutionalTitle(e: CalendarEvent): string | null {
  if (!e.title) return null;
  const rawTitle = e.title.trim();
  if (!rawTitle.startsWith('[') || rawTitle.includes('\r') || rawTitle.includes('\n')) return null;
  const prefixEnd = rawTitle.indexOf(']');
  if (prefixEnd < 2) return null;
  const title = rawTitle.slice(prefixEnd + 1).trim();
  return title || null;
}

type Semester = '1' | '2';

const SEMESTER_BY_START_TITLE = new Map<string, Semester>([
  ['秋季学期开始上课', '1'],
  ['春季学期开始上课', '2'],
]);

const BREAK_TITLES = new Set(['寒假', '暑假', '暑期']);
const EXAM_WEEK_TITLE = '期末考试周';
const MIN_BREAK_DAYS = 3;

function civilDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

export function isAcademicBreakEvent(e: CalendarEvent): boolean {
  const title = institutionalTitle(e);
  if (!title || !BREAK_TITLES.has(title) || !e.isAllDay || !e.end) return false;
  return civilDay(e.end) - civilDay(e.start) >= MIN_BREAK_DAYS;
}

function semesterForEvent(e: CalendarEvent): Semester | null {
  const title = institutionalTitle(e);
  return title ? (SEMESTER_BY_START_TITLE.get(title) ?? null) : null;
}

function isSemesterStartEvent(e: CalendarEvent): boolean {
  return semesterForEvent(e) !== null;
}

function isExamWeekEvent(e: CalendarEvent): boolean {
  return institutionalTitle(e) === EXAM_WEEK_TITLE;
}

export function findBreakEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return events.filter(isAcademicBreakEvent).sort((a, b) => a.start.getTime() - b.start.getTime());
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentWeekNumber(weekOne: Date, now: Date): number {
  const days = civilDay(now) - civilDay(weekOne);
  return Math.floor(days / 7) + 1;
}

export interface AcademicWindow {
  status: 'inTerm';
  academicYear: string;
  semester: '1' | '2';
  weekOneMonday: string;
  currentWeek: number;
  /** The next known exam week, break, or semester start. */
  nextBreakStart?: string;
  nextBreakTitle?: string;
}

export interface OnBreak {
  status: 'onBreak';
  breakTitle: string;
}

export function currentAcademicWindow(
  events: readonly CalendarEvent[],
  now: Date,
): AcademicWindow | OnBreak | null {
  const breaks = findBreakEvents(events);
  const activeBreak = breaks.find((event) => {
    const end = event.end;
    return end !== null && event.start.getTime() <= now.getTime() && end.getTime() > now.getTime();
  });
  const activeBreakTitle = activeBreak ? institutionalTitle(activeBreak) : null;
  if (activeBreakTitle) return { status: 'onBreak', breakTitle: activeBreakTitle };

  const starts = events
    .filter(isSemesterStartEvent)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const past = starts.filter((e) => e.start.getTime() <= now.getTime());
  const current = past.at(-1);
  if (!current) return null;
  const completedBreak = breaks.find((event) => {
    const end = event.end;
    return (
      end !== null &&
      event.start.getTime() > current.start.getTime() &&
      end.getTime() <= now.getTime()
    );
  });
  if (completedBreak) return null;

  const semester = semesterForEvent(current);
  if (!semester) return null;
  const startYear = current.start.getFullYear();
  const academicYear =
    semester === '1' ? `${startYear}-${startYear + 1}` : `${startYear - 1}-${startYear}`;
  const weekOneMonday = toIsoDate(current.start);
  const currentWeek = currentWeekNumber(current.start, now);

  const future = [...events]
    .filter(
      (e) =>
        e.start.getTime() > now.getTime() &&
        (isExamWeekEvent(e) || isAcademicBreakEvent(e) || isSemesterStartEvent(e)),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const futureTitle = future ? institutionalTitle(future) : null;

  return {
    status: 'inTerm',
    academicYear,
    semester,
    weekOneMonday,
    currentWeek,
    ...(future && futureTitle
      ? { nextBreakStart: toIsoDate(future.start), nextBreakTitle: futureTitle }
      : {}),
  };
}

export function inferWeekOneMonday(events: readonly CalendarEvent[], now: Date): string | null {
  const window = currentAcademicWindow(events, now);
  if (window?.status === 'inTerm') return window.weekOneMonday;

  const upcoming = events
    .filter((e) => isSemesterStartEvent(e) && e.start.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return upcoming ? toIsoDate(upcoming.start) : null;
}
