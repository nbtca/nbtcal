import {
  TimetableError,
  type AcademicTerm,
  type AcademicTermRef,
  type Timetable,
  type TimetableCalendarDay,
  type TimetableMeeting,
  type TimetablePeriod,
  type TimetableUnresolvedItem,
  type TimetableUnresolvedSourceField,
  type TimetableWarning,
  type Weekday,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

interface SelectOption {
  value: string;
  label: string;
  selected: boolean;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarString(record: UnknownRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const hex = body[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(codePoint)
        && codePoint >= 0
        && codePoint <= 0x10ffff
        && (codePoint < 0xd800 || codePoint > 0xdfff)
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function readAttribute(attributes: string, name: string): string | null {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attributes);
  if (quoted?.[2] !== undefined) return decodeHtml(quoted[2]);
  const bare = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(attributes);
  return bare?.[1] ? decodeHtml(bare[1]) : null;
}

function parseSelect(html: string, name: string): SelectOption[] {
  const select = new RegExp(
    `<select\\b(?=[^>]*(?:id|name)\\s*=\\s*["']${name}["'])[^>]*>([\\s\\S]*?)<\\/select>`,
    'i',
  ).exec(html);
  if (!select?.[1]) return [];

  const options: SelectOption[] = [];
  const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  for (const match of select[1].matchAll(optionPattern)) {
    const attributes = match[1] ?? '';
    const value = readAttribute(attributes, 'value')?.trim() ?? '';
    const label = stripTags(match[2] ?? '');
    if (!value || !label) continue;
    options.push({
      value,
      label,
      selected: /\bselected(?:\s*=|\s|$)/i.test(attributes),
    });
  }
  return options;
}

export function parseAvailableTerms(html: string): AcademicTerm[] {
  const years = parseSelect(html, 'xnm');
  const semesters = parseSelect(html, 'xqm');
  if (years.length === 0 || semesters.length === 0) {
    throw new TimetableError(
      'INVALID_TERM_CATALOG',
      'The timetable page did not contain a valid academic-term catalog.',
    );
  }

  const terms: AcademicTerm[] = [];
  for (const year of years) {
    for (const semester of semesters) {
      terms.push({
        academicYear: year.value,
        semester: semester.value,
        academicYearLabel: year.label,
        semesterLabel: semester.label,
        current: year.selected && semester.selected,
      });
    }
  }
  return terms;
}

export function parseWeekExpression(expression: string): number[] {
  const weeks = new Set<number>();
  const parts = expression
    .replace(/[，、；;]/g, ',')
    .replace(/[~～—–至]/g, '-')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const originalPart of parts) {
    const parity = /(?:\(\s*单\s*\)|（\s*单\s*）|单周)/.test(originalPart)
      ? 1
      : /(?:\(\s*双\s*\)|（\s*双\s*）|双周)/.test(originalPart)
        ? 0
        : null;
    const part = originalPart
      .replace(/[第周]/g, '')
      .replace(/[（(]\s*[单双]\s*[)）]/g, '')
      .replace(/[单双]周?/g, '')
      .replace(/\s+/g, '');
    const range = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
    if (!range?.[1]) continue;
    const start = Number.parseInt(range[1], 10);
    const end = Number.parseInt(range[2] ?? range[1], 10);
    if (start < 1 || end < start || end > 60) continue;
    for (let week = start; week <= end; week += 1) {
      if (parity === null || week % 2 === parity) weeks.add(week);
    }
  }
  return [...weeks].sort((a, b) => a - b);
}

const UNRESOLVED_FIELD_KEYS: ReadonlyArray<[
  TimetableUnresolvedSourceField,
  readonly string[],
]> = [
  ['kcmc', ['kcmc', 'KCMC']],
  ['xqj', ['xqj', 'XQJ']],
  ['zcd', ['zcd', 'ZCD']],
  ['jcs', ['jcs', 'JCS', 'jc', 'JC']],
  ['cdmc', ['cdmc', 'CDMC']],
  ['qsjsz', ['qsjsz', 'QSJSZ']],
  ['xksj', ['xksj', 'XKSJ']],
  ['sjkcgs', ['sjkcgs', 'SJKCGS']],
  ['qtkcgs', ['qtkcgs', 'QTKCGS']],
];

function preserveUnresolvedPractice(value: unknown, itemIndex: number): TimetableUnresolvedItem {
  const sourceFields: Partial<Record<TimetableUnresolvedSourceField, string>> = {};
  if (isRecord(value)) {
    for (const [field, keys] of UNRESOLVED_FIELD_KEYS) {
      const text = scalarString(value, keys);
      if (text) sourceFields[field] = text;
    }
  }
  return { kind: 'practice', itemIndex, sourceFields };
}

function parsePeriodRange(value: string): { start: number; end: number } | null {
  const numbers = [...value.matchAll(/\d{1,2}/g)].map((match) => Number.parseInt(match[0], 10));
  if (numbers.length === 0) return null;
  const start = numbers[0]!;
  const end = numbers.length === 1 ? start : numbers[numbers.length - 1]!;
  if (start < 1 || end < start || end > 99) return null;
  return { start, end };
}

function parseWeekday(value: string | null): Weekday | null {
  if (!value) return null;
  const weekday = Number.parseInt(value, 10);
  return weekday >= 1 && weekday <= 7 ? weekday as Weekday : null;
}

function splitTeachers(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[、,，;；/]+/).map((item) => item.trim()).filter(Boolean))];
}

function parseMeeting(
  value: unknown,
  itemIndex: number,
  kind: TimetableMeeting['kind'],
  warnings: TimetableWarning[],
): TimetableMeeting | null {
  if (!isRecord(value)) {
    warnings.push({ code: kind === 'practice' ? 'UNRESOLVED_PRACTICE' : 'INVALID_MEETING', itemIndex });
    return null;
  }

  const courseName = scalarString(value, ['kcmc', 'KCMC']);
  const weekday = parseWeekday(scalarString(value, ['xqj', 'XQJ']));
  const weekText = scalarString(value, ['zcd', 'ZCD', 'qsjsz', 'QSJSZ']);
  const periodText = scalarString(value, ['jcs', 'JCS', 'jc', 'JC']);
  const weeks = weekText ? parseWeekExpression(weekText) : [];
  const periods = periodText ? parsePeriodRange(periodText) : null;

  if (!courseName || !weekday || weeks.length === 0 || !periods) {
    warnings.push({
      code: kind === 'practice' ? 'UNRESOLVED_PRACTICE' : 'INVALID_MEETING',
      itemIndex,
      field: !courseName ? 'courseName' : !weekday ? 'weekday' : weeks.length === 0 ? 'weeks' : 'periods',
    });
    return null;
  }

  return {
    sourceId: scalarString(value, ['jxb_id', 'JXB_ID', 'jxbid', 'JXBID']),
    courseName,
    teacherNames: splitTeachers(scalarString(value, ['xm', 'XM', 'jsxm', 'JSXM'])),
    location: scalarString(value, ['cdmc', 'CDMC']),
    weekday,
    startPeriod: periods.start,
    endPeriod: periods.end,
    weeks,
    kind,
  };
}

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parsePeriods(value: unknown, warnings?: TimetableWarning[]): TimetablePeriod[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['data'])
      ? value['data']
      : isRecord(value) && Array.isArray(value['jcList'])
        ? value['jcList']
        : [];
  const periods = new Map<number, TimetablePeriod>();
  rows.forEach((row, itemIndex) => {
    if (!isRecord(row)) {
      warnings?.push({ code: 'INVALID_PERIOD', itemIndex });
      return;
    }
    const periodText = scalarString(row, ['jcdm', 'JCDM', 'jc', 'JC', 'jcmc', 'JCMC']);
    const periodMatch = periodText?.match(/\d{1,2}/)?.[0];
    const period = periodMatch ? Number.parseInt(periodMatch, 10) : Number.NaN;
    const start = normalizeTime(scalarString(row, ['qssj', 'QSSJ']));
    const end = normalizeTime(scalarString(row, ['jssj', 'JSSJ']));
    if (!Number.isInteger(period) || period < 1 || period > 99 || !start || !end || start >= end) {
      warnings?.push({ code: 'INVALID_PERIOD', itemIndex });
      return;
    }
    periods.set(period, {
      period,
      label: scalarString(row, ['jcmc', 'JCMC']),
      start,
      end,
    });
  });
  return [...periods.values()].sort((a, b) => a.period - b.period);
}

function parseJsonPayload(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new TimetableError('INVALID_TIMETABLE', 'The timetable response was not valid JSON.');
  }
}

export function parsePeriodPayload(input: unknown): TimetablePeriod[] {
  const payload = parseJsonPayload(input);
  const periods = parsePeriods(payload);
  if (periods.length === 0) {
    throw new TimetableError('INVALID_TIMETABLE', 'The period response did not contain usable times.');
  }
  return periods;
}

export function parseTimetablePayload(
  input: unknown,
  requestedTerm: AcademicTermRef,
  fetchedAt: Date = new Date(),
): Timetable {
  const payload = parseJsonPayload(input);
  if (!isRecord(payload) || (!Array.isArray(payload['kbList']) && !Array.isArray(payload['sjkList']))) {
    throw new TimetableError('INVALID_TIMETABLE', 'The timetable response did not match the expected shape.');
  }

  if (!isRecord(payload['xsxx'])) {
    throw new TimetableError('TERM_MISMATCH', 'The campus system did not confirm the requested academic term.');
  }
  const year = scalarString(payload['xsxx'], ['XNM', 'xnm']);
  const semester = scalarString(payload['xsxx'], ['XQM', 'xqm']);
  if (!year || !semester || year !== requestedTerm.academicYear || semester !== requestedTerm.semester) {
    throw new TimetableError('TERM_MISMATCH', 'The campus system returned a different academic term.');
  }

  const warnings: TimetableWarning[] = [];
  const meetings: TimetableMeeting[] = [];
  const unresolvedItems: TimetableUnresolvedItem[] = [];
  const regular = Array.isArray(payload['kbList']) ? payload['kbList'] : [];
  const practice = Array.isArray(payload['sjkList']) ? payload['sjkList'] : [];
  regular.forEach((item, index) => {
    const meeting = parseMeeting(item, index, 'regular', warnings);
    if (meeting) meetings.push(meeting);
  });
  practice.forEach((item, index) => {
    const meeting = parseMeeting(item, index, 'practice', warnings);
    if (meeting) meetings.push(meeting);
    else unresolvedItems.push(preserveUnresolvedPractice(item, index));
  });

  // `rqazcList` is empty in the observed NingboTech response and its schema has
  // not been verified. Never guess dates from unknown fields: callers may add
  // an explicitly verified mapping to `calendarDays`, or provide week one to
  // the ICS writer.
  const calendarDays: TimetableCalendarDay[] = [];
  warnings.push({ code: 'CALENDAR_DATES_UNAVAILABLE' });
  const periods = parsePeriods(payload['xqbzxxszList'], warnings);
  if (periods.length === 0) warnings.push({ code: 'PERIODS_UNAVAILABLE' });

  return {
    term: { ...requestedTerm },
    meetings,
    unresolvedItems,
    periods,
    calendarDays,
    warnings,
    fetchedAt: new Date(fetchedAt.getTime()),
  };
}
