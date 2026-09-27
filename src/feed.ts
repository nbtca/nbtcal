import { FeedFetchError } from './types.js';

export const DEFAULT_FEED_URL = 'https://ical.nbtca.space';
export const SCHOOL_FEED_URL = 'https://ical.nbtca.space/school.ics';
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface FetchFeedOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface FeedValidators {
  etag?: string;
  lastModified?: string;
}

export interface FetchFeedConditionalOptions extends FetchFeedOptions {
  validators?: FeedValidators;
}

export type FeedFetchResult =
  | { status: 'modified'; text: string; validators: FeedValidators }
  | { status: 'not-modified'; validators: FeedValidators };

function statusError(status: number): FeedFetchError {
  return new FeedFetchError(`Feed request failed: HTTP ${status}`);
}

function readValidators(headers: Headers, fallback: FeedValidators = {}): FeedValidators {
  const etag = headers.get('etag') ?? fallback.etag;
  const lastModified = headers.get('last-modified') ?? fallback.lastModified;
  return { ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) };
}

export async function fetchFeed(
  url: string = DEFAULT_FEED_URL,
  options: FetchFeedOptions = {},
): Promise<string> {
  const result = await fetchFeedConditional(url, options);
  if (result.status === 'not-modified') throw statusError(304);
  return result.text;
}

export async function fetchFeedConditional(
  url: string = DEFAULT_FEED_URL,
  options: FetchFeedConditionalOptions = {},
): Promise<FeedFetchResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError('timeoutMs must be a finite positive timer duration.');
  }
  const controller = new AbortController();
  const timeoutReason = Symbol('timeout');
  const timeout = setTimeout(() => {
    controller.abort(timeoutReason);
  }, timeoutMs);
  const abortFromCaller = (): void => {
    controller.abort();
  };

  if (options.signal) {
    if (options.signal.aborted) abortFromCaller();
    else options.signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const { etag, lastModified } = options.validators ?? {};
    const headers: Record<string, string> = {};
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;
    const response = await fetch(url, { signal: controller.signal, headers });
    if (response.status === 304) {
      return {
        status: 'not-modified',
        validators: readValidators(response.headers, options.validators),
      };
    }
    if (!response.ok) throw statusError(response.status);
    return {
      status: 'modified',
      text: await response.text(),
      validators: readValidators(response.headers),
    };
  } catch (err) {
    if (err instanceof FeedFetchError) throw err;
    const aborted =
      controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    const reason = aborted
      ? controller.signal.reason === timeoutReason
        ? 'request timed out'
        : 'request aborted'
      : String(err);
    throw new FeedFetchError(`Failed to fetch feed: ${reason}`, { cause: err });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
