import { parseAvailableTerms, parsePeriodPayload, parseTimetablePayload } from './parse.js';
import {
  TimetableError,
  type AcademicTermRef,
  type AuthenticatedTransport,
  type CreateNbtTimetableClientOptions,
  type NbtTimetableClient,
  type Timetable,
  type TimetablePeriod,
  type TimetableRequestOptions,
  type TransportResponse,
} from './types.js';

const SCHEDULE_INDEX_PATH = '/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default';
const SCHEDULE_DATA_PATH = '/jwglxt/kbcx/xskbcx_cxXsgrkb.html';
const PERIOD_DATA_PATH = '/jwglxt/kbcx/xskbcx_cxRjc.html';

function looksLikeLoginPage(response: TransportResponse, body: string): boolean {
  if (response.url) {
    try {
      const finalUrl = new URL(response.url);
      if (
        finalUrl.pathname.includes('/authserver/login')
        || finalUrl.pathname.includes('/users/sign_in')
      ) return true;
    } catch {
      // A malformed optional response URL is not exposed in the public error.
    }
  }
  return /(?:pwdEncryptSalt|id=["']pwdFromId["']|name=["']execution["'])/i.test(body);
}

function asSafeTransportError(error: unknown): Error {
  if (error instanceof TimetableError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new DOMException('The timetable request was aborted.', 'AbortError');
  }
  if (typeof error === 'object' && error !== null) {
    const code = Reflect.get(error, 'code');
    const name = Reflect.get(error, 'name');
    if (code === 'SESSION_EXPIRED' || name === 'SessionExpiredError') {
      return new TimetableError('SESSION_EXPIRED', 'The authenticated campus session has expired.');
    }
    if (name === 'AbortError') {
      return new DOMException('The timetable request was aborted.', 'AbortError');
    }
  }
  return new TimetableError('NETWORK_ERROR', 'The campus timetable request failed.');
}

async function requestText(
  transport: AuthenticatedTransport,
  url: URL,
  init: RequestInit,
): Promise<string> {
  let response: TransportResponse;
  try {
    response = await transport(url, init);
  } catch (error) {
    throw asSafeTransportError(error);
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw asSafeTransportError(error);
  }
  if (response.status === 401 || response.status === 403 || looksLikeLoginPage(response, body)) {
    throw new TimetableError('SESSION_EXPIRED', 'The authenticated campus session has expired.', {
      status: response.status,
    });
  }
  if (response.status < 200 || response.status >= 300) {
    throw new TimetableError('HTTP_ERROR', 'The campus timetable request returned an error.', {
      status: response.status,
    });
  }
  return body;
}

function termForm(term: AcademicTermRef): string {
  return new URLSearchParams({
    xnm: term.academicYear,
    xqm: term.semester,
  }).toString();
}

function formHeaders(referer: URL): Record<string, string> {
  return {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Referer: referer.href,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

function mergePeriods(primary: readonly TimetablePeriod[], supplement: readonly TimetablePeriod[]): TimetablePeriod[] {
  const merged = new Map<number, TimetablePeriod>();
  for (const period of primary) merged.set(period.period, period);
  for (const period of supplement) merged.set(period.period, period);
  return [...merged.values()].sort((a, b) => a.period - b.period);
}

export function createNbtTimetableClient(
  transport: AuthenticatedTransport,
  options: CreateNbtTimetableClientOptions,
): NbtTimetableClient {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== 'https:' || baseUrl.username !== '' || baseUrl.password !== '') {
    throw new TypeError('baseUrl must use HTTPS without embedded credentials.');
  }
  const now = options.now ?? (() => new Date());
  const url = (path: string): URL => new URL(path, baseUrl);
  const scheduleIndexUrl = url(SCHEDULE_INDEX_PATH);

  async function listTerms(requestOptions: TimetableRequestOptions = {}) {
    const body = await requestText(transport, scheduleIndexUrl, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: requestOptions.signal,
    });
    return parseAvailableTerms(body);
  }

  async function fetchTerm(
    term: AcademicTermRef,
    requestOptions: TimetableRequestOptions = {},
  ): Promise<Timetable> {
    if (!term.academicYear.trim() || !term.semester.trim()) {
      throw new TypeError('Academic year and semester codes are required.');
    }
    const init: RequestInit = {
      method: 'POST',
      body: termForm(term),
      headers: formHeaders(scheduleIndexUrl),
      signal: requestOptions.signal,
    };
    const scheduleBody = await requestText(transport, url(SCHEDULE_DATA_PATH), init);
    const timetable = parseTimetablePayload(scheduleBody, term, now());

    let remotePeriods: TimetablePeriod[] = [];
    let periodsUnavailable = false;
    try {
      const periodBody = await requestText(transport, url(PERIOD_DATA_PATH), init);
      remotePeriods = parsePeriodPayload(periodBody);
    } catch (error) {
      if (error instanceof TimetableError && error.code === 'SESSION_EXPIRED') throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      periodsUnavailable = true;
    }

    const periods = mergePeriods(timetable.periods, remotePeriods);
    const warnings = timetable.warnings.filter((warning) => warning.code !== 'PERIODS_UNAVAILABLE');
    if (periods.length === 0 || periodsUnavailable) warnings.push({ code: 'PERIODS_UNAVAILABLE' });
    return { ...timetable, periods, warnings };
  }

  async function fetchTerms(
    terms: readonly AcademicTermRef[],
    requestOptions: TimetableRequestOptions = {},
  ): Promise<Timetable[]> {
    const timetables: Timetable[] = [];
    for (const term of terms) {
      timetables.push(await fetchTerm(term, requestOptions));
    }
    return timetables;
  }

  return { listTerms, fetchTerm, fetchTerms };
}
