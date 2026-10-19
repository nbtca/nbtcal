import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedTransport } from '../timetable/types.js';
import { createNbtStudentRecordsClient } from './client.js';
const JWXT_ORIGIN = 'https://jwxt.example';

const term = { academicYear: '2026', semester: '3' };
const row = { xnm: '2026', xqm: '3', kch: 'COURSE-A', kcmc: 'Algorithms' };

function page(items: unknown[], currentPage = 1, totalPage = 1, totalResult = items.length) {
  return { items, currentPage, totalPage, totalResult };
}

function clientFor(payload: unknown) {
  const transport = vi.fn<AuthenticatedTransport>(() =>
    Promise.resolve(new Response(JSON.stringify(payload))),
  );
  return { client: createNbtStudentRecordsClient(transport, { baseUrl: JWXT_ORIGIN }), transport };
}

describe('student records client', () => {
  it.each(['exams', 'grades'] as const)(
    'queries only the selected term through the %s read route',
    async (kind) => {
      const { client, transport } = clientFor(page([]));
      await client.fetchRecords(kind, term);
      const call = transport.mock.calls[0];
      if (!call) throw new Error('Expected a query');
      const [url, init] = call;
      expect(url.pathname).toBe(
        kind === 'exams'
          ? '/jwglxt/kwgl/kscx_cxXsksxxIndex.html'
          : '/jwglxt/cjcx/cjcx_cxXsgrcj.html',
      );
      expect(url.searchParams.get('doType')).toBe('query');
      expect(url.searchParams.get('gnmkdm')).toBe(kind === 'exams' ? 'N358105' : 'N305005');
      expect(init.method).toBe('POST');
      const body = new URLSearchParams(init.body as string);
      expect(body.get('xnm')).toBe('2026');
      expect(body.get('xqm')).toBe('3');
      expect(body.get('queryModel.showCount')).toBe('50');
      expect([...body.keys()]).not.toContain('xh');
    },
  );

  it('keeps hidden exam times as text and parses published times in campus time', async () => {
    const { client } = clientFor(
      page([
        { ...row, kssj: '未放开不可查', xm: 'Synthetic Student', xh: 'SYNTHETIC-ID' },
        { ...row, kssj: '2026-12-10(09:00-11:00)', cdmc: 'A101', cdxqmc: 'Campus', zwh: '08' },
      ]),
    );
    const data = await client.fetchRecords('exams', term);
    expect(data.kind).toBe('exams');
    expect(data.items[0]).toMatchObject({
      start: new Date('2026-12-10T01:00:00Z'),
      end: new Date('2026-12-10T03:00:00Z'),
      location: 'A101',
      seat: '08',
    });
    expect(data.items[1]).toMatchObject({ start: null, end: null, timeText: '未放开不可查' });
    expect(JSON.stringify(data)).not.toMatch(/Synthetic Student|SYNTHETIC-ID|"xm"|"xh"/);
  });

  it.each(['2026-02-30(09:00-11:00)', '2026-12-10(25:00-26:00)', '2026-12-10(11:00-09:00)'])(
    'does not invent an exam date from %s',
    async (kssj) => {
      const { client } = clientFor(page([{ ...row, kssj }]));
      const data = await client.fetchRecords('exams', term);
      expect(data.items[0]).toMatchObject({ start: null, end: null, timeText: kssj });
    },
  );

  it('preserves grade labels and zero values while dropping unrelated identity fields', async () => {
    const { client } = clientFor(
      page([
        {
          ...row,
          cj: '良好',
          xf: '2.5',
          jd: '0',
          cjsfzf: '是',
          xh: 'SYNTHETIC-ID',
          userModel: { private: true },
        },
        { ...row, cj: 0, xf: 'unavailable', jd: null, cjsfzf: '否' },
      ]),
    );
    const data = await client.fetchRecords('grades', term);
    expect(data.items[0]).toMatchObject({
      grade: '良好',
      credits: 2.5,
      gradePoint: 0,
      voided: true,
    });
    expect(data.items[1]).toMatchObject({
      grade: '0',
      credits: null,
      gradePoint: null,
      voided: false,
    });
    expect(JSON.stringify(data)).not.toMatch(/SYNTHETIC-ID|userModel/);
  });

  it('collects every page sequentially', async () => {
    const pages: number[] = [];
    const transport: AuthenticatedTransport = (_url, init) => {
      const number = Number(new URLSearchParams(init.body as string).get('queryModel.currentPage'));
      pages.push(number);
      return Promise.resolve(
        new Response(JSON.stringify(page([{ ...row, kch: `COURSE-${number}` }], number, 2, 2))),
      );
    };
    const data = await createNbtStudentRecordsClient(transport, {
      baseUrl: JWXT_ORIGIN,
    }).fetchRecords('grades', term);
    expect(pages).toEqual([1, 2]);
    expect(data.items).toHaveLength(2);
  });

  it.each([
    null,
    page([null]),
    { message: 'private marker' },
    { ...page([]), success: false },
    { ...page([]), type: 'error' },
    page([{ ...row, kcmc: null }]),
    page([], 1, 2, 2),
    page([row], 1, 1, 2),
    page([], 1, 101, 5001),
    page([], 2),
    page([], 1, 0, 1),
  ])('rejects malformed, incomplete or mismatched results', async (payload) => {
    const { client } = clientFor(payload);
    await expect(client.fetchRecords('grades', term)).rejects.toMatchObject({
      code: 'INVALID_RECORDS',
    });
  });

  it('accepts an empty zero-page result without treating it as an error', async () => {
    const { client } = clientFor(page([], 1, 0, 0));
    await expect(client.fetchRecords('exams', term)).resolves.toMatchObject({
      kind: 'exams',
      items: [],
    });
  });

  it.each([401, 403])('recognizes HTTP %s as an expired session', async (status) => {
    const transport: AuthenticatedTransport = () =>
      Promise.resolve(new Response('private marker', { status }));
    await expect(
      createNbtStudentRecordsClient(transport, { baseUrl: JWXT_ORIGIN }).fetchRecords(
        'exams',
        term,
      ),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('recognizes a login form returned with HTTP 200', async () => {
    const transport: AuthenticatedTransport = () =>
      Promise.resolve(new Response('<form id="pwdFromId"></form>'));
    await expect(
      createNbtStudentRecordsClient(transport, { baseUrl: JWXT_ORIGIN }).fetchRecords(
        'grades',
        term,
      ),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('does not expose private response bodies or transport errors', async () => {
    for (const transport of [
      () => Promise.resolve(new Response('private marker', { status: 500 })),
      () => Promise.reject(new Error('private marker')),
    ]) {
      let caught: unknown;
      try {
        await createNbtStudentRecordsClient(transport, { baseUrl: JWXT_ORIGIN }).fetchRecords(
          'exams',
          term,
        );
      } catch (error) {
        caught = error;
      }
      expect(String(caught)).not.toContain('private marker');
    }
  });

  it('stops before the next page when canceled', async () => {
    const controller = new AbortController();
    const transport = vi.fn<AuthenticatedTransport>(() => {
      controller.abort(new DOMException('Canceled', 'AbortError'));
      return Promise.resolve(new Response(JSON.stringify(page([row], 1, 2, 2))));
    });
    await expect(
      createNbtStudentRecordsClient(transport, { baseUrl: JWXT_ORIGIN }).fetchRecords(
        'exams',
        term,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('rejects unsafe origins and invalid term selectors before making requests', async () => {
    const transport = vi.fn<AuthenticatedTransport>();
    expect(() =>
      createNbtStudentRecordsClient(transport, { baseUrl: 'http://jwxt.example' }),
    ).toThrow(TypeError);
    expect(() =>
      createNbtStudentRecordsClient(transport, { baseUrl: 'https://user:pass@jwxt.example' }),
    ).toThrow(TypeError);
    await expect(
      createNbtStudentRecordsClient(transport, { baseUrl: JWXT_ORIGIN }).fetchRecords('grades', {
        academicYear: '',
        semester: '',
      }),
    ).rejects.toThrow(TypeError);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('academic client host boundaries', () => {
  it('normalizes session-expired errors raised by the host transport without exposing their contents', async () => {
    const client = createNbtStudentRecordsClient(
      () => Promise.reject(Object.assign(new Error('private marker'), { code: 'SESSION_EXPIRED' })),
      { baseUrl: JWXT_ORIGIN },
    );
    await expect(client.fetchRecords('grades', term)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      message: 'The campus session has expired.',
    });
  });
  it('rejects results from another term explicitly', async () => {
    const { client } = clientFor(page([{ ...row, xnm: '2025' }]));
    await expect(client.fetchRecords('exams', term)).rejects.toMatchObject({
      code: 'TERM_MISMATCH',
    });
  });
  it('uses the host clock for the fetch timestamp', async () => {
    const timestamp = new Date('2026-10-01T00:00:00Z');
    const client = createNbtStudentRecordsClient(
      () => Promise.resolve(new Response(JSON.stringify(page([])))),
      { baseUrl: JWXT_ORIGIN, now: () => timestamp },
    );
    expect((await client.fetchRecords('exams', term)).fetchedAt).toEqual(timestamp);
  });
});

it('rejects a canceled final page even if the injected transport ignores its signal', async () => {
  const controller = new AbortController();
  const client = createNbtStudentRecordsClient(
    () => {
      controller.abort(new DOMException('Aborted', 'AbortError'));
      return Promise.resolve(new Response(JSON.stringify(page([]))));
    },
    { baseUrl: JWXT_ORIGIN },
  );
  await expect(
    client.fetchRecords('exams', term, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
