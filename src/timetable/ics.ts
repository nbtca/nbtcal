import {
  TimetableError,
  type IcsPeriodTime,
  type Timetable,
  type TimetableMeeting,
  type TimetableToIcsOptions,
} from './types.js';
import {
  addIsoDays,
  CAMPUS_TIME_ZONE,
  parseClockTime,
  parseIsoDate,
  validateWeekOneMonday,
} from './date-time.js';

const encoder = new TextEncoder();

interface CalendarEventLineData {
  uid: string;
  date: string;
  start: string;
  end: string;
  meeting: TimetableMeeting;
}

interface CalendarEventCandidate extends Omit<CalendarEventLineData, 'uid'> {
  classKey: string;
  week: number;
}

function compactDate(value: string): string {
  if (!parseIsoDate(value)) {
    throw new TimetableError(
      'MISSING_CALENDAR_DATES',
      'The timetable contains an invalid calendar date.',
    );
  }
  return value.replace(/-/g, '');
}

function compactTime(value: string): string {
  const time = parseClockTime(value);
  if (!time) {
    throw new TimetableError('MISSING_PERIOD_TIME', 'A timetable period contains an invalid time.');
  }
  return `${String(time.hour).padStart(2, '0')}${String(time.minute).padStart(2, '0')}00`;
}

function formatUtcStamp(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new TypeError('generatedAt must be a valid Date.');
  const iso = value.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldLine(line: string): string[] {
  if (encoder.encode(line).length <= 75) return [line];
  const folded: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (current && bytes + characterBytes > 75) {
      folded.push(current);
      current = ` ${character}`;
      bytes = 1 + characterBytes;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }
  if (current) folded.push(current);
  return folded;
}

function hash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of encoder.encode(value)) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(36)}${second.toString(36)}`;
}

function defaultIfEmpty(value: string | undefined, fallback: string): string {
  return value === undefined || value.length === 0 ? fallback : value;
}

function normalizeUidDomain(value: string | undefined): string {
  const domain = defaultIfEmpty(value?.trim().toLowerCase(), 'calendar.nbtca.space');
  if (
    domain.length > 253 ||
    domain
      .split('.')
      .some(
        (label) =>
          label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  ) {
    throw new TypeError('uidDomain must be a valid ASCII domain name.');
  }
  return domain;
}

function assertPeriodTime(value: unknown): asserts value is IcsPeriodTime {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('start' in value) ||
    typeof value.start !== 'string' ||
    !('end' in value) ||
    typeof value.end !== 'string'
  ) {
    throw new TimetableError('MISSING_PERIOD_TIME', 'A timetable period contains an invalid time.');
  }
  const start = compactTime(value.start);
  const end = compactTime(value.end);
  if (start >= end) {
    throw new TimetableError('MISSING_PERIOD_TIME', 'A timetable period must end after it starts.');
  }
}

function periodMap(
  timetable: Timetable,
  overrides: Readonly<Record<number, IcsPeriodTime>> | undefined,
): Map<number, IcsPeriodTime> {
  const periods = new Map<number, IcsPeriodTime>();
  for (const period of timetable.periods) {
    const value = { start: period.start, end: period.end };
    assertPeriodTime(value);
    periods.set(period.period, value);
  }
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      const period = Number(key);
      if (!Number.isSafeInteger(period) || period <= 0 || String(period) !== key) {
        throw new TypeError('periodTimes keys must be positive integers.');
      }
      assertPeriodTime(value);
      periods.set(period, value);
    }
  }
  return periods;
}

function meetingDate(
  timetable: Timetable,
  meeting: TimetableMeeting,
  week: number,
  weekOneMonday: string | undefined,
): string {
  const authoritative = timetable.calendarDays.find(
    (day) => day.week === week && day.weekday === meeting.weekday,
  );
  if (authoritative) return authoritative.date;
  if (!weekOneMonday) {
    throw new TimetableError(
      'MISSING_CALENDAR_DATES',
      'The timetable response has no date map; weekOneMonday is required for ICS export.',
    );
  }
  return addIsoDays(weekOneMonday, (week - 1) * 7 + meeting.weekday - 1);
}

function buildEvents(
  timetable: Timetable,
  options: TimetableToIcsOptions,
): CalendarEventLineData[] {
  const periods = periodMap(timetable, options.periodTimes);
  const uidDomain = normalizeUidDomain(options.uidDomain);
  const candidates: CalendarEventCandidate[] = [];
  const duplicateKeys = new Set<string>();
  for (const meeting of timetable.meetings) {
    const startPeriod = periods.get(meeting.startPeriod);
    const endPeriod = periods.get(meeting.endPeriod);
    if (!startPeriod || !endPeriod) {
      throw new TimetableError(
        'MISSING_PERIOD_TIME',
        `No time mapping exists for period ${!startPeriod ? meeting.startPeriod : meeting.endPeriod}.`,
      );
    }
    if (compactTime(startPeriod.start) >= compactTime(endPeriod.end)) {
      throw new TimetableError(
        'MISSING_PERIOD_TIME',
        'A timetable meeting must end after it starts.',
      );
    }
    for (const week of meeting.weeks) {
      const date = meetingDate(timetable, meeting, week, options.weekOneMonday);
      const classKey = meeting.sourceId
        ? `source:${meeting.sourceId}`
        : `fallback:${hash(
            [meeting.kind, meeting.courseName, ...meeting.teacherNames].join('\u001f'),
          )}`;
      const duplicateKey = [
        classKey,
        meeting.courseName,
        meeting.weekday,
        meeting.startPeriod,
        meeting.endPeriod,
        meeting.location ?? '',
        ...meeting.teacherNames,
        week,
      ].join('\u001f');
      if (duplicateKeys.has(duplicateKey)) continue;
      duplicateKeys.add(duplicateKey);
      candidates.push({
        classKey,
        week,
        date,
        start: startPeriod.start,
        end: endPeriod.end,
        meeting,
      });
    }
  }

  const groups = new Map<string, CalendarEventCandidate[]>();
  for (const candidate of candidates) {
    const groupKey = `${candidate.classKey}\u001f${candidate.week}`;
    const group = groups.get(groupKey) ?? [];
    group.push(candidate);
    groups.set(groupKey, group);
  }

  const events: CalendarEventLineData[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        a.meeting.weekday - b.meeting.weekday ||
        a.meeting.startPeriod - b.meeting.startPeriod ||
        a.meeting.endPeriod - b.meeting.endPeriod ||
        a.meeting.courseName.localeCompare(b.meeting.courseName) ||
        (a.meeting.location ?? '').localeCompare(b.meeting.location ?? ''),
    );
    group.forEach((candidate, occurrenceIndex) => {
      const identity = [
        timetable.term.academicYear,
        timetable.term.semester,
        candidate.classKey,
        candidate.week,
        occurrenceIndex,
      ].join('\u001f');
      events.push({
        uid: `nbt-${hash(identity)}@${uidDomain}`,
        date: candidate.date,
        start: candidate.start,
        end: candidate.end,
        meeting: candidate.meeting,
      });
    });
  }
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      a.meeting.courseName.localeCompare(b.meeting.courseName) ||
      a.uid.localeCompare(b.uid),
  );
}

export function timetableToIcs(timetable: Timetable, options: TimetableToIcsOptions = {}): string {
  if (options.weekOneMonday) validateWeekOneMonday(options.weekOneMonday);
  const generatedAt = formatUtcStamp(options.generatedAt ?? new Date());
  const events = buildEvents(timetable, options);
  const calendarName = defaultIfEmpty(options.calendarName?.trim(), '我的课表');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NBTCA//nbtcal Timetable//ZH-CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `X-WR-TIMEZONE:${CAMPUS_TIME_ZONE}`,
    'BEGIN:VTIMEZONE',
    `TZID:${CAMPUS_TIME_ZONE}`,
    `X-LIC-LOCATION:${CAMPUS_TIME_ZONE}`,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (const event of events) {
    const teachers =
      event.meeting.teacherNames.length > 0 ? `教师：${event.meeting.teacherNames.join('、')}` : '';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${generatedAt}`,
      `LAST-MODIFIED:${generatedAt}`,
      `DTSTART;TZID=${CAMPUS_TIME_ZONE}:${compactDate(event.date)}T${compactTime(event.start)}`,
      `DTEND;TZID=${CAMPUS_TIME_ZONE}:${compactDate(event.date)}T${compactTime(event.end)}`,
      `SUMMARY:${escapeText(event.meeting.courseName)}`,
      'CLASS:PRIVATE',
    );
    if (event.meeting.location) lines.push(`LOCATION:${escapeText(event.meeting.location)}`);
    if (teachers) lines.push(`DESCRIPTION:${escapeText(teachers)}`);
    lines.push('SEQUENCE:0', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.flatMap(foldLine).join('\r\n')}\r\n`;
}
