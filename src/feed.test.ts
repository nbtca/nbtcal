import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFeed, DEFAULT_FEED_URL } from './feed.js';
import { FeedFetchError } from './types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchFeed', () => {
  it('returns the response text on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('BEGIN:VCALENDAR', { status: 200 }),
    );
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
});
