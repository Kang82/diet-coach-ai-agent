import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { LAST_WEEK_LIMITS, lastWeekFeedback, pickLastWeek } from './last-week.ts';
import { DAYS, MEAL_TYPES, type Plan, type Slot } from './types.ts';

describe('pickLastWeek', () => {
  const conv = (conversationId: string, weekStart: string, planAt: string) => ({ conversationId, weekStart, planAt });

  it('지금 대화와 이번 주보다 늦거나 같은 주를 빼고 가장 최근 것', () => {
    const list = [
      conv('now', '2026-11-09', '2026-11-08T10:00:00Z'),
      conv('same-week', '2026-11-16', '2026-11-15T10:00:00Z'),
      conv('older', '2026-11-02', '2026-11-01T10:00:00Z'),
      conv('last', '2026-11-09', '2026-11-09T12:00:00Z'),
    ];
    expect(pickLastWeek(list, 'now', '2026-11-16')?.conversationId).toBe('last');
  });

  it('없으면 undefined', () => {
    expect(pickLastWeek([], 'now', '2026-11-16')).toBeUndefined();
    expect(pickLastWeek([conv('now', '2026-11-09', '2026-11-08T10:00:00Z')], 'now', '2026-11-16')).toBeUndefined();
  });
});

describe('lastWeekFeedback', () => {
  const slot = (day: Slot['day'], meal: Slot['meal']): Slot => ({ day, meal });

  it('체크가 없으면 undefined', () => {
    expect(lastWeekFeedback(planA, [], profileA, classesA)).toBeUndefined();
  });

  it('체크한 칸은 먹은 메뉴, 나머지는 안 먹은 메뉴 (식단표 순)', () => {
    const result = lastWeekFeedback(planA, [slot('tue', 'lunch'), slot('mon', 'dinner')], profileA, classesA);
    expect(result?.weekStart).toBe(planA.weekStart);
    expect(result?.eaten).toEqual([
      { menu: '두부 채소 볶음', count: 1 },
      { menu: '백반', count: 1 },
    ]);
    expect(result?.skipped).toEqual([
      '회덮밥',
      '닭가슴살 샐러드',
      '쌀국수',
      '연어 덮밥',
      '돈가스',
      '달걀 채소볶음과 잡곡밥',
      '국밥',
      '두부 된장찌개와 잡곡밥',
      '비빔밥',
      '생선구이 정식',
      '잔치국수',
      '닭가슴살 샤브샤브',
    ]);
  });

  it('같은 메뉴(공백 무시)는 묶고, 한 칸이라도 체크했으면 먹은 쪽. 많이 먹은 순', () => {
    const plan: Plan = structuredClone(planA);
    plan.cells.find((c) => c.day === 'wed' && c.meal === 'lunch')!.menuId = '백 반';
    plan.cells.find((c) => c.day === 'fri' && c.meal === 'lunch')!.menuId = '백반';
    const result = lastWeekFeedback(plan, [slot('mon', 'lunch'), slot('wed', 'lunch'), slot('fri', 'lunch')], profileA, classesA);
    expect(result?.eaten).toEqual([
      { menu: '백반', count: 2 },
      { menu: '회덮밥', count: 1 },
    ]);
    expect(result?.skipped).not.toContain('백반');
  });

  it('지금 외식 목록에 없거나 avoid로 분류한 외식 메뉴는 뺀다', () => {
    const profile = structuredClone(profileA);
    profile.meals.find((m) => m.place === 'eat_out')!.menus = ['백반', '돈가스', '쌀국수', '회덮밥'];
    const classes = classesA.map((c) => (c.menu === '돈가스' ? { ...c, class: 'avoid' as const } : c));
    const result = lastWeekFeedback(planA, [slot('fri', 'lunch'), slot('thu', 'lunch'), slot('mon', 'lunch')], profile, classes);
    expect(result?.eaten).toEqual([{ menu: '회덮밥', count: 1 }]);
    expect(result?.skipped).not.toContain('국밥');
    expect(result?.skipped).not.toContain('돈가스');
  });

  it('지금 집밥 끼니가 없으면 집밥 메뉴는 뺀다. 남는 게 없으면 undefined', () => {
    const profile = structuredClone(profileA);
    for (const m of profile.meals) if (m.place === 'home') m.place = 'skip';
    const result = lastWeekFeedback(planA, [slot('mon', 'dinner'), slot('mon', 'lunch')], profile, classesA);
    expect(result?.eaten).toEqual([{ menu: '회덮밥', count: 1 }]);
    expect(result?.skipped.every((m) => ['백반', '쌀국수', '돈가스', '국밥'].includes(m))).toBe(true);

    const noEatOut = structuredClone(profile);
    for (const m of noEatOut.meals) if (m.place === 'eat_out') m.place = 'skip';
    expect(lastWeekFeedback(planA, [slot('mon', 'lunch')], noEatOut, classesA)).toBeUndefined();
  });

  it('메뉴 이름은 줄바꿈을 공백으로 바꾸고 길이를 자른다', () => {
    const plan: Plan = structuredClone(planA);
    plan.cells.find((c) => c.day === 'mon' && c.meal === 'dinner')!.menuId = `두부\n볶음 ${'가'.repeat(60)}`;
    const result = lastWeekFeedback(plan, [slot('mon', 'dinner')], profileA, classesA);
    const name = result!.eaten[0]!.menu;
    expect(name.startsWith('두부 볶음 ')).toBe(true);
    expect(name).toHaveLength(LAST_WEEK_LIMITS.name);
  });

  it('목록은 각각 최대 14개', () => {
    const plan: Plan = structuredClone(planA);
    const base = plan.cells.find((c) => c.place === 'home')!;
    const slots = DAYS.flatMap((day) => MEAL_TYPES.map((meal) => slot(day, meal))).slice(0, 20);
    plan.cells = slots.map((s, i) => ({ ...base, ...s, menuId: `집밥 ${i}` }));
    const skippedOnly = lastWeekFeedback(plan, slots.slice(0, 1), profileA, classesA);
    expect(skippedOnly!.skipped).toHaveLength(LAST_WEEK_LIMITS.menus);
    expect(lastWeekFeedback(plan, slots, profileA, classesA)!.eaten).toHaveLength(LAST_WEEK_LIMITS.menus);
  });
});
