import { FeedFetchError } from './types.js';

export const DEFAULT_FEED_URL = 'https://ical.nbtca.space';

export interface FetchFeedOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchFeed(
  url: string = DEFAULT_FEED_URL,
  options: FetchFeedOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new FeedFetchError(`Feed request failed: HTTP ${response.status}`);
    }
    return await response.text();
  } catch (err) {
    if (err instanceof FeedFetchError) throw err;
    const reason = err instanceof Error && err.name === 'AbortError' ? 'request timed out' : String(err);
    throw new FeedFetchError(`Failed to fetch feed: ${reason}`, { cause: err });
  } finally {
    clearTimeout(timeout);
  }
}
