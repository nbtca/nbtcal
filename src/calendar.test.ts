import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadCalendar } from './calendar.js';
import { MIXED_ICS } from './__tests__/fixtures.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadCalendar', () => {
  it('fetches, parses, and exposes query methods', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(MIXED_ICS, { status: 200 })));

    const calendar = await loadCalendar();
    const events = calendar.inRange(new Date('2026-06-20T00:00:00Z'), new Date('2026-06-21T00:00:00Z'));
    expect(events.map((e) => e.uid).sort()).toEqual(['timed-1', 'timed-2']);

    const buckets = calendar.heatmap({
      start: new Date('2026-06-20T00:00:00Z'),
      end: new Date('2026-06-20T00:00:00Z'),
    });
    expect(buckets).toEqual([{ date: '2026-06-20', count: 2 }]);
  });

  it('passes a custom url through to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(MIXED_ICS, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await loadCalendar({ url: 'https://example.com/cal.ics' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/cal.ics', expect.any(Object));
  });
});
