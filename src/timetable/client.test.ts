import { describe, expect, it } from 'vitest';
import { createNbtTimetableClient } from './client.js';
import { TimetableError, type AuthenticatedTransport, type TransportResponse } from './types.js';

function response(body: unknown, options: { status?: number; url?: string } = {}): TransportResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status: options.status ?? 200,
    url: options.url,
    async text() { return text; },
  };
}

describe('createNbtTimetableClient', () => {
  it('uses the injected transport for term catalog, timetable and periods', async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    const transport: AuthenticatedTransport = async (url, init) => {
      calls.push({ url, init });
      if (url.pathname.endsWith('cxXskbcxIndex.html')) {
        return response(`
          <select id="xnm"><option value="2026" selected>2026-2027</option></select>
          <select id="xqm"><option value="3" selected>第一学期</option></select>
        `);
      }
      if (url.pathname.endsWith('cxXsgrkb.html')) {
        return response({
          xsxx: { XNM: '2026', XQM: '3' },
          kbList: [{ kcmc: '课程', xqj: '1', zcd: '1周', jcs: '1-2' }],
          sjkList: [],
          rqazcList: [],
          xqbzxxszList: [],
        });
      }
      return response([
        { jcdm: '1', qssj: '08:00', jssj: '08:45' },
        { jcdm: '2', qssj: '08:50', jssj: '09:35' },
      ]);
    };
    const client = createNbtTimetableClient(transport, {
      baseUrl: 'https://jwxt.example.edu',
      now: () => new Date('2026-08-01T00:00:00Z'),
    });

    await expect(client.listTerms()).resolves.toHaveLength(1);
    const timetable = await client.fetchTerm({ academicYear: '2026', semester: '3' });
    expect(timetable.periods).toHaveLength(2);
    expect(calls.map((call) => `${call.init.method} ${call.url.pathname}`)).toEqual([
      'GET /jwglxt/kbcx/xskbcx_cxXskbcxIndex.html',
      'POST /jwglxt/kbcx/xskbcx_cxXsgrkb.html',
      'POST /jwglxt/kbcx/xskbcx_cxRjc.html',
    ]);
    expect(calls[1]?.init.body).toBe('xnm=2026&xqm=3');
    expect(JSON.stringify(calls)).not.toMatch(/username|password|student/i);
  });

  it('recognizes a 200 login page as an expired session', async () => {
    const transport: AuthenticatedTransport = async () => response(
      '<form id="pwdFromId"><input id="pwdEncryptSalt"></form>',
      { url: 'https://auth.example.edu/authserver/login' },
    );
    const client = createNbtTimetableClient(transport, { baseUrl: 'https://jwxt.example.edu' });
    await expect(client.listTerms()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('does not include a response body in HTTP errors', async () => {
    const secretMarker = 'private-response-marker';
    const transport: AuthenticatedTransport = async () => response(secretMarker, { status: 500 });
    const client = createNbtTimetableClient(transport, { baseUrl: 'https://jwxt.example.edu' });
    let caught: unknown;
    try { await client.listTerms(); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(TimetableError);
    expect(String(caught)).not.toContain(secretMarker);
    expect(caught).toMatchObject({ code: 'HTTP_ERROR', status: 500 });
  });

  it('sanitizes abort errors and refuses plaintext base URLs', async () => {
    const marker = 'private-abort-marker';
    const transport: AuthenticatedTransport = async () => {
      throw new DOMException(marker, 'AbortError');
    };
    const client = createNbtTimetableClient(transport, { baseUrl: 'https://jwxt.example.edu' });
    let caught: unknown;
    try { await client.listTerms(); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ name: 'AbortError' });
    expect(String(caught)).not.toContain(marker);
    expect(() => createNbtTimetableClient(transport, {
      baseUrl: 'http://jwxt.example.edu',
    })).toThrow(TypeError);
  });

  it('fetches multiple terms sequentially', async () => {
    let active = 0;
    let maximumActive = 0;
    const transport: AuthenticatedTransport = async (url, init) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (url.pathname.endsWith('cxXsgrkb.html')) {
        const form = new URLSearchParams(String(init.body ?? ''));
        return response({
          xsxx: { XNM: form.get('xnm'), XQM: form.get('xqm') },
          kbList: [], sjkList: [], rqazcList: [], xqbzxxszList: [],
        });
      }
      return response([{ jcdm: '1', qssj: '08:00', jssj: '08:45' }]);
    };
    const client = createNbtTimetableClient(transport, { baseUrl: 'https://jwxt.example.edu' });
    await client.fetchTerms([
      { academicYear: '2025', semester: '12' },
      { academicYear: '2026', semester: '3' },
    ]);
    expect(maximumActive).toBe(1);
  });
});
