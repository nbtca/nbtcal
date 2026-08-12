import { FeedFetchError } from './types.js';

export const DEFAULT_FEED_URL = 'https://ical.nbtca.space';
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface FetchFeedOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchFeed(
  url: string = DEFAULT_FEED_URL,
  options: FetchFeedOptions = {},
): Promise<string> {
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
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new FeedFetchError(`Feed request failed: HTTP ${response.status}`);
    }
    return await response.text();
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
