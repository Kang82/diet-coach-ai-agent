import { describe, expect, it } from 'vitest';
import { nextMondayKst } from './helpers.ts';

describe('nextMondayKst', () => {
  it.each([
    ['2026-11-06T03:00:00Z', '2026-11-09'], // 금요일 낮 (한국)
    ['2026-11-08T14:59:00Z', '2026-11-09'], // 일요일 23:59 (한국)
    ['2026-11-08T15:00:00Z', '2026-11-16'], // 월요일 00:00 (한국) → 다음 주
    ['2026-11-09T10:00:00Z', '2026-11-16'], // 월요일 낮 (한국)
    ['2026-12-29T00:00:00Z', '2027-01-04'], // 해 넘김
  ])('%s → %s', (now, expected) => {
    expect(nextMondayKst(new Date(now))).toBe(expected);
  });
});
