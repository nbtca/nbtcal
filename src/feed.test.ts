import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFeed, fetchFeedConditional, DEFAULT_FEED_URL } from './feed.js';
import { FeedFetchError } from './types.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchFeed', () => {
  it('returns the response text on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('BEGIN:VCALENDAR', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await fetchFeed();
    expect(text).toBe('BEGIN:VCALENDAR');
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_FEED_URL, expect.any(Object));
  });

  it('fetches a custom url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('X', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFeed('https://example.com/cal.ics');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/cal.ics', expect.any(Object));
  });

  it('throws FeedFetchError on non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    await expect(fetchFeed()).rejects.toBeInstanceOf(FeedFetchError);
  });

  it('throws FeedFetchError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(fetchFeed()).rejects.toBeInstanceOf(FeedFetchError);
  });

  it('reports caller cancellation as aborted instead of timed out', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init.signal!;
            if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
            else
              signal.addEventListener(
                'abort',
                () => {
                  reject(new DOMException('Aborted', 'AbortError'));
                },
                { once: true },
              );
          }),
      ),
    );

    await expect(fetchFeed(undefined, { signal: controller.signal })).rejects.toMatchObject({
      message: 'Failed to fetch feed: request aborted',
    });
  });

  it('reports an expired timeout as timed out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener(
              'abort',
              () => {
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true },
            );
          }),
      ),
    );

    const result = expect(fetchFeed(undefined, { timeoutMs: 100 })).rejects.toMatchObject({
      message: 'Failed to fetch feed: request timed out',
    });
    await vi.advanceTimersByTimeAsync(100);
    await result;
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects an invalid timeout value: %s',
    async (timeoutMs) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('X', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      await expect(fetchFeed(undefined, { timeoutMs })).rejects.toBeInstanceOf(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('fetchFeedConditional', () => {
  const etag = '"v1"';
  const lastModified = 'Wed, 23 Sep 2026 10:00:00 GMT';

  it('sends no conditional headers without validators', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('X', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFeedConditional();
    await fetchFeed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      const headers = new Headers(init.headers);
      expect(headers.has('if-none-match')).toBe(false);
      expect(headers.has('if-modified-since')).toBe(false);
    }
  });

  it('returns the text and validators of a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('BEGIN:VCALENDAR', {
          status: 200,
          headers: { ETag: etag, 'Last-Modified': lastModified },
        }),
      ),
    );

    await expect(fetchFeedConditional()).resolves.toEqual({
      status: 'modified',
      text: 'BEGIN:VCALENDAR',
      validators: { etag, lastModified },
    });
  });

  it('returns empty validators when the response has none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('X', { status: 200 })));
    await expect(fetchFeedConditional()).resolves.toEqual({
      status: 'modified',
      text: 'X',
      validators: {},
    });
  });

  it('sends If-None-Match and If-Modified-Since from the validators', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFeedConditional(undefined, { validators: { etag, lastModified } });
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('if-none-match')).toBe(etag);
    expect(headers.get('if-modified-since')).toBe(lastModified);
  });

  it('reports 304 as not modified and keeps validators the response omits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { ETag: '"v2"' } })),
    );

    await expect(
      fetchFeedConditional(undefined, { validators: { etag, lastModified } }),
    ).resolves.toEqual({ status: 'not-modified', validators: { etag: '"v2"', lastModified } });
  });

  it('replaces validators on a 200 answer to a conditional request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('Y', { status: 200, headers: { 'Last-Modified': 'Thu, 24 Sep 2026' } }),
        ),
    );

    await expect(
      fetchFeedConditional(undefined, { validators: { etag, lastModified } }),
    ).resolves.toEqual({
      status: 'modified',
      text: 'Y',
      validators: { lastModified: 'Thu, 24 Sep 2026' },
    });
  });

  it('keeps fetchFeed rejecting an unexpected 304', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 304 })));
    await expect(fetchFeed()).rejects.toMatchObject({
      name: 'FeedFetchError',
      message: 'Feed request failed: HTTP 304',
    });
  });

  it('throws FeedFetchError on other non-OK statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    await expect(fetchFeedConditional(undefined, { validators: { etag } })).rejects.toBeInstanceOf(
      FeedFetchError,
    );
  });
});
