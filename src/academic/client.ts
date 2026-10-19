import { campusDateTime } from '../timetable/date-time.js';
import type {
  AcademicTermRef,
  AuthenticatedTransport,
  TimetableRequestOptions,
} from '../timetable/types.js';
import { STUDENT_RECORD_ROUTES } from './routes.js';
import {
  StudentRecordsError,
  type StudentExam,
  type StudentGrade,
  type StudentRecords,
  type StudentRecordsKind,
  type CreateNbtStudentRecordsClientOptions,
  type NbtStudentRecordsClient,
} from './types.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;

function invalidResponse(): StudentRecordsError {
  return new StudentRecordsError('INVALID_RECORDS', 'The academic query response is invalid.');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))
    return null;
  return String(value).trim() || null;
}

function decimal(row: Record<string, unknown>, key: string): number | null {
  const value = text(row, key);
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseExam(row: Record<string, unknown>): StudentExam {
  const courseName = text(row, 'kcmc');
  if (!courseName) throw invalidResponse();
  const timeText = text(row, 'kssj');
  const match = /^(\d{4}-\d{2}-\d{2})\s*[（(](\d{2}:\d{2})\s*[-–~～]\s*(\d{2}:\d{2})[）)]$/.exec(
    timeText ?? '',
  );
  let start: Date | null = null;
  let end: Date | null = null;
  if (match?.[1] && match[2] && match[3]) {
    try {
      const parsedStart = campusDateTime(match[1], match[2]);
      const parsedEnd = campusDateTime(match[1], match[3]);
      if (parsedEnd > parsedStart) {
        start = parsedStart;
        end = parsedEnd;
      }
    } catch {
      // Keep an unpublished or malformed time as text; never invent an exam date.
    }
  }
  return {
    courseCode: text(row, 'kch'),
    courseName,
    examName: text(row, 'ksmc'),
    timeText,
    start,
    end,
    location: text(row, 'cdmc'),
    campus: text(row, 'cdxqmc'),
    seat: text(row, 'zwh'),
    assessment: text(row, 'khfs'),
  };
}

function parseGrade(row: Record<string, unknown>): StudentGrade {
  const courseName = text(row, 'kcmc');
  if (!courseName) throw invalidResponse();
  const flag = text(row, 'cjsfzf');
  return {
    courseCode: text(row, 'kch'),
    courseName,
    grade: text(row, 'cj'),
    credits: decimal(row, 'xf'),
    gradePoint: decimal(row, 'jd'),
    courseNature: text(row, 'kcxzmc'),
    examNature: text(row, 'ksxz'),
    remark: text(row, 'cjbz'),
    voided: flag === '是' || flag === '1' ? true : flag === '否' || flag === '0' ? false : null,
  };
}

async function queryPage(
  transport: AuthenticatedTransport,
  url: URL,
  init: RequestInit,
): Promise<unknown> {
  try {
    const response = await transport(url, init);
    if (response.status === 401 || response.status === 403)
      throw new StudentRecordsError('SESSION_EXPIRED', 'The campus session has expired.');
    if (response.status < 200 || response.status >= 300)
      throw new StudentRecordsError('HTTP_ERROR', 'The academic query failed.');
    const body = await response.text();
    if (/pwdEncryptSalt|id=["']pwdFromId["']|name=["']execution["']/i.test(body))
      throw new StudentRecordsError('SESSION_EXPIRED', 'The campus session has expired.');
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw invalidResponse();
    }
  } catch (error) {
    if (error instanceof StudentRecordsError) throw error;
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'SESSION_EXPIRED'
    ) {
      throw new StudentRecordsError('SESSION_EXPIRED', 'The campus session has expired.');
    }
    if (error instanceof Error && error.name === 'AbortError')
      throw new DOMException('The academic query was aborted.', 'AbortError');
    throw new StudentRecordsError('NETWORK_ERROR', 'The academic query failed.');
  }
}

export function createNbtStudentRecordsClient(
  transport: AuthenticatedTransport,
  options: CreateNbtStudentRecordsClientOptions,
): NbtStudentRecordsClient {
  const base = new URL(options.baseUrl);
  const now = options.now ?? (() => new Date());
  if (base.protocol !== 'https:' || base.username || base.password)
    throw new TypeError('The academic query requires HTTPS without embedded credentials.');

  async function fetchRecords(
    kind: StudentRecordsKind,
    term: AcademicTermRef,
    requestOptions: TimetableRequestOptions = {},
  ): Promise<StudentRecords> {
    const { signal } = requestOptions;
    if (!/^\d{4}$/.test(term.academicYear) || !/^[A-Za-z0-9_-]{1,32}$/.test(term.semester))
      throw new TypeError('Invalid academic term.');
    const route = STUDENT_RECORD_ROUTES[kind];
    const referer = new URL(route.index, base);
    referer.searchParams.set('gnmkdm', route.code);
    const url = new URL(route.query, base);
    url.search = new URLSearchParams({ doType: 'query', gnmkdm: route.code }).toString();
    const rows: Record<string, unknown>[] = [];
    let pages = 1;
    let total = 0;
    for (let page = 1; page <= pages; page += 1) {
      signal?.throwIfAborted();
      const payload = await queryPage(transport, url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: referer.href,
        },
        body: new URLSearchParams({
          xnm: term.academicYear,
          xqm: term.semester,
          'queryModel.showCount': String(PAGE_SIZE),
          'queryModel.currentPage': String(page),
          'queryModel.sortName': kind === 'exams' ? 'kssj' : 'kch',
          'queryModel.sortOrder': 'asc',
        }).toString(),
        ...(signal === undefined ? {} : { signal }),
      });
      signal?.throwIfAborted();
      if (
        !record(payload) ||
        payload.success === false ||
        payload.type === 'error' ||
        !Array.isArray(payload.items) ||
        !Number.isSafeInteger(payload.totalPage) ||
        !Number.isSafeInteger(payload.totalResult) ||
        !Number.isSafeInteger(payload.currentPage)
      )
        throw invalidResponse();
      const pageCount = payload.totalPage as number;
      const resultCount = payload.totalResult as number;
      if (
        pageCount < 0 ||
        pageCount > MAX_PAGES ||
        resultCount < 0 ||
        resultCount > PAGE_SIZE * MAX_PAGES ||
        (resultCount > 0 && pageCount === 0) ||
        (resultCount === 0 && pageCount > 1) ||
        payload.currentPage !== page ||
        (page > 1 && (pageCount !== pages || resultCount !== total))
      )
        throw invalidResponse();
      pages = pageCount;
      total = resultCount;
      for (const row of payload.items) {
        if (!record(row)) throw invalidResponse();
        if (text(row, 'xnm') !== term.academicYear || text(row, 'xqm') !== term.semester)
          throw new StudentRecordsError(
            'TERM_MISMATCH',
            'The academic query returned another term.',
          );
        rows.push(row);
      }
      if (rows.length > total || (page < pages && payload.items.length === 0))
        throw invalidResponse();
    }
    if (rows.length !== total) throw invalidResponse();
    const common = {
      term: { academicYear: term.academicYear, semester: term.semester },
      fetchedAt: now(),
    };
    return kind === 'exams'
      ? {
          ...common,
          kind,
          items: rows
            .map(parseExam)
            .sort(
              (a, b) =>
                (a.start?.getTime() ?? Number.MAX_SAFE_INTEGER) -
                (b.start?.getTime() ?? Number.MAX_SAFE_INTEGER),
            ),
        }
      : { ...common, kind, items: rows.map(parseGrade) };
  }

  return { fetchRecords: fetchRecords as NbtStudentRecordsClient['fetchRecords'] };
}
