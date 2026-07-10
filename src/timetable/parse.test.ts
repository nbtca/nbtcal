import { describe, expect, it } from 'vitest';
import {
  parseAvailableTerms,
  parsePeriodPayload,
  parseTimetablePayload,
  parseWeekExpression,
} from './parse.js';
import { TimetableError } from './types.js';

describe('parseAvailableTerms', () => {
  it('returns every year/semester combination and marks the selected pair', () => {
    const html = `
      <select id="xnm">
        <option value="2025">2025-2026</option>
        <option value="2026" selected="selected">2026-2027</option>
      </select>
      <select name="xqm">
        <option value="3" selected>第一学期</option>
        <option value="12">第二学期</option>
        <option value="16">短学期</option>
      </select>`;
    const terms = parseAvailableTerms(html);
    expect(terms).toHaveLength(6);
    expect(terms.find((term) => term.current)).toEqual({
      academicYear: '2026',
      semester: '3',
      academicYearLabel: '2026-2027',
      semesterLabel: '第一学期',
      current: true,
    });
  });

  it('fails closed when the catalog is absent', () => {
    expect(() => parseAvailableTerms('<html>login</html>')).toThrow(TimetableError);
  });

  it('does not throw on an invalid numeric HTML entity', () => {
    const terms = parseAvailableTerms(`
      <select id="xnm"><option value="2026" selected>&#x110000;</option></select>
      <select id="xqm"><option value="3" selected>第一学期</option></select>
    `);
    expect(terms[0]?.academicYearLabel).toBe('&#x110000;');
  });
});

describe('parseWeekExpression', () => {
  it.each([
    ['1-10周', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['1-15周(单)', [1, 3, 5, 7, 9, 11, 13, 15]],
    ['2-16周(双)', [2, 4, 6, 8, 10, 12, 14, 16]],
    ['1，3，5-6周', [1, 3, 5, 6]],
    ['16周', [16]],
    ['1-8周，10-16周(双)', [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16]],
  ])('parses %s', (expression, expected) => {
    expect(parseWeekExpression(expression)).toEqual(expected);
  });
});

describe('parseTimetablePayload', () => {
  it('normalizes meetings and periods without guessing an unverified date-map schema', () => {
    const timetable = parseTimetablePayload({
      xsxx: { XNM: '2026', XQM: '3' },
      kbList: [{
        jxb_id: 'class-a',
        kcmc: '离散数学',
        xm: '教师甲、教师乙',
        cdmc: '教学楼 A-101',
        xqj: '2',
        zcd: '1-15周(单)',
        jcs: '3-5',
      }],
      sjkList: [{ kcmc: '实践课程', qsjsz: '1-2周' }],
      rqazcList: [{ zc: '1', xqj: '2', rq: '2026-09-08' }],
      xqbzxxszList: [
        { jcdm: '3', jcmc: '第三节', qssj: '09:50', jssj: '10:35' },
        { jcdm: '5', jcmc: '第五节', qssj: '11:30', jssj: '12:15' },
      ],
    }, { academicYear: '2026', semester: '3' }, new Date('2026-08-01T00:00:00Z'));

    expect(timetable.meetings).toEqual([expect.objectContaining({
      sourceId: 'class-a',
      weekday: 2,
      startPeriod: 3,
      endPeriod: 5,
      weeks: [1, 3, 5, 7, 9, 11, 13, 15],
    })]);
    expect(timetable.periods.map((period) => period.period)).toEqual([3, 5]);
    expect(timetable.calendarDays).toEqual([]);
    expect(timetable.unresolvedItems).toEqual([{
      kind: 'practice',
      itemIndex: 0,
      sourceFields: { kcmc: '实践课程', qsjsz: '1-2周' },
    }]);
    expect(timetable.warnings).toContainEqual(expect.objectContaining({ code: 'UNRESOLVED_PRACTICE' }));
    expect(timetable.warnings).toContainEqual(expect.objectContaining({ code: 'CALENDAR_DATES_UNAVAILABLE' }));
  });

  it('rejects a response for a different term without exposing response data', () => {
    expect(() => parseTimetablePayload({
      xsxx: { XNM: '2025', XQM: '12' },
      kbList: [],
      sjkList: [],
    }, { academicYear: '2026', semester: '3' })).toThrowError(
      expect.objectContaining({ code: 'TERM_MISMATCH' }),
    );
  });

  it('fails closed when the response does not confirm its term', () => {
    expect(() => parseTimetablePayload({ kbList: [], sjkList: [] }, {
      academicYear: '2026', semester: '3',
    })).toThrowError(expect.objectContaining({ code: 'TERM_MISMATCH' }));
  });

  it('rejects non-timetable JSON', () => {
    expect(() => parseTimetablePayload('{}', { academicYear: '2026', semester: '3' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_TIMETABLE' }));
  });
});

describe('parsePeriodPayload', () => {
  it('parses the direct-array period API shape', () => {
    expect(parsePeriodPayload(JSON.stringify([
      { jcdm: '1', jcmc: '第一节', qssj: '08:00:00', jssj: '08:45:00' },
      { jcdm: '2', jcmc: '第二节', qssj: '08:50', jssj: '09:35' },
    ]))).toEqual([
      { period: 1, label: '第一节', start: '08:00', end: '08:45' },
      { period: 2, label: '第二节', start: '08:50', end: '09:35' },
    ]);
  });
});
