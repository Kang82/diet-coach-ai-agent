// 스펙 6장, 8.4
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { checkPlan } from './check-plan.ts';
import { formatCheckSummary } from './format-summary.ts';
import type { CheckStats } from './types.ts';

const baseStats: CheckStats = {
  avoidTagCounts: { dairy: 0 },
  limitedMenuCounts: { 돈가스: 1, 국밥: 1 },
  limitedTagCounts: { fried: 1, sugary: 0, fatty_meat: 0, processed_meat: 0 },
  consecutiveCount: 0,
};

describe('formatCheckSummary', () => {
  it('기본: 피할 음식, 주 1회 이하 메뉴, 연속 없음 3줄', () => {
    expect(formatCheckSummary(baseStats, { avoid: ['dairy'] })).toEqual([
      '유제품 0회',
      '주 1회 이하 메뉴: 돈가스 1회, 국밥 1회',
      '같은 메뉴 연속 없음',
    ]);
  });

  it('주 1회 이하 메뉴가 없으면 그 줄을 뺀다', () => {
    const stats = { ...baseStats, limitedMenuCounts: {} };
    expect(formatCheckSummary(stats, { avoid: ['dairy'] })).toEqual(['유제품 0회', '같은 메뉴 연속 없음']);
  });

  it('피할 음식이 여러 개면 한 줄로 잇는다', () => {
    const stats = { ...baseStats, avoidTagCounts: { dairy: 0, egg: 0 } };
    expect(formatCheckSummary(stats, { avoid: ['egg', 'dairy'] })[0]).toBe('유제품 0회, 달걀 0회');
  });

  it('meat는 펼친 태그를 표시하지 않는다', () => {
    const stats = { ...baseStats, avoidTagCounts: { meat: 0, pork: 0, beef: 0, chicken: 0 } };
    expect(formatCheckSummary(stats, { avoid: ['meat'] })[0]).toBe('고기 0회');
  });

  it('피할 음식이 없으면 그 줄을 뺀다', () => {
    const stats = { ...baseStats, avoidTagCounts: {} };
    expect(formatCheckSummary(stats, { avoid: [] })).toEqual([
      '주 1회 이하 메뉴: 돈가스 1회, 국밥 1회',
      '같은 메뉴 연속 없음',
    ]);
  });

  it('연속이 있으면 횟수를 쓴다', () => {
    const stats = { ...baseStats, consecutiveCount: 2 };
    expect(formatCheckSummary(stats, { avoid: ['dairy'] })[2]).toBe('같은 메뉴 연속 2회');
  });

  it('checkPlan 결과와 이어 붙이면 스펙 예시 문구가 나온다', () => {
    const { stats } = checkPlan(planA, profileA, classesA, rulesA);
    expect(formatCheckSummary(stats, profileA)).toEqual([
      '유제품 0회',
      '주 1회 이하 메뉴: 돈가스 1회, 국밥 1회',
      '같은 메뉴 연속 없음',
    ]);
  });
});
