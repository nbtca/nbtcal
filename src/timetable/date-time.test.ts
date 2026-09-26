import { describe, expect, it } from 'vitest';
import { campusDateTime, campusIsoDate } from './index.js';

describe('campus time', () => {
  it('reads the campus date of an instant', () => {
    expect(campusIsoDate(new Date('2026-09-06T15:59:59Z'))).toBe('2026-09-06');
    expect(campusIsoDate(new Date('2026-09-06T16:00:00Z'))).toBe('2026-09-07');
  });

  it('turns a campus date and time into an instant', () => {
    expect(campusDateTime('2026-09-07', '08:00')).toEqual(new Date('2026-09-07T00:00:00Z'));
    expect(campusDateTime('2026-09-07', '00:00')).toEqual(new Date('2026-09-06T16:00:00Z'));
  });
});
