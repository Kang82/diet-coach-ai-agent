// 스펙 8.2
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { checkPlan } from './check-plan.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import type { CheckResult, Day, MealType, MenuClassification, Plan, PlanCell, Profile, Slot } from './types.ts';

function setup() {
  return {
    plan: structuredClone(planA),
    profile: structuredClone(profileA),
    classes: structuredClone(classesA),
    rules: structuredClone(rulesA),
  };
}

function cellAt(plan: Plan, day: Day, meal: MealType): PlanCell {
  const found = plan.cells.find((c) => c.day === day && c.meal === meal);
  if (!found) throw new Error(`픽스처에 ${day} ${meal} 칸이 없음`);
  return found;
}

function removeCell(plan: Plan, day: Day, meal: MealType): void {
  plan.cells = plan.cells.filter((c) => !(c.day === day && c.meal === meal));
}

const s = (day: Day, meal: MealType): Slot => ({ day, meal });

function run(ctx: { plan: Plan; profile: Profile; classes: MenuClassification[]; rules: typeof rulesA }): CheckResult {
  return checkPlan(ctx.plan, ctx.profile, ctx.classes, ctx.rules);
}

describe('checkPlan', () => {
  it('1. 기본 픽스처는 통과하고 통계를 채운다', () => {
    const result = run(setup());
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.stats).toEqual({
      avoidTagCounts: { dairy: 0 },
      limitedMenuCounts: { 돈가스: 1, 국밥: 1 },
      limitedTagCounts: { fried: 1, sugary: 0, fatty_meat: 0, processed_meat: 0 },
      consecutiveCount: 0,
    });
  });

  it('2. 피할 음식 태그', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'tue', 'dinner').tags.push('dairy');
    const result = run(ctx);
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual([
      { rule: 'avoid_tag', cells: [s('tue', 'dinner')], regenerate: [s('tue', 'dinner')], detail: 'dairy' },
    ]);
  });

  it('3. 주 1회 이하 메뉴를 두 번 배치', () => {
    const ctx = setup();
    Object.assign(cellAt(ctx.plan, 'tue', 'lunch'), { menuId: '국밥', tags: ['meat', 'beef'] });
    expect(run(ctx).violations).toEqual([
      {
        rule: 'class_weekly_limit',
        cells: [s('tue', 'lunch'), s('fri', 'lunch')],
        regenerate: [s('fri', 'lunch')],
        detail: '국밥',
      },
    ]);
  });

  it('4. 피하기로 분류된 메뉴', () => {
    const ctx = setup();
    ctx.classes.find((c) => c.menu === '쌀국수')!.class = 'avoid';
    expect(run(ctx).violations).toEqual([
      { rule: 'class_avoid', cells: [s('wed', 'lunch')], regenerate: [s('wed', 'lunch')] },
    ]);
  });

  it('5. 태그 횟수 제한 초과', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'fri', 'dinner').tags.push('fried');
    expect(run(ctx).violations).toEqual([
      {
        rule: 'tag_weekly_limit',
        cells: [s('thu', 'lunch'), s('fri', 'dinner')],
        regenerate: [s('fri', 'dinner')],
        detail: 'fried',
      },
    ]);
  });

  it('6. 같은 메뉴 연속', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'sat', 'dinner').menuId = '비빔밥';
    expect(run(ctx).violations).toEqual([
      { rule: 'consecutive_menu', cells: [s('sat', 'lunch'), s('sat', 'dinner')], regenerate: [s('sat', 'dinner')] },
    ]);
  });

  it('7. 일정이 있는 끼니를 건너뛰고 이어 본다', () => {
    const ctx = setup();
    removeCell(ctx.plan, 'thu', 'dinner');
    ctx.plan.events.push({ day: 'thu', meal: 'dinner', note: '회식, 고깃집' });
    Object.assign(cellAt(ctx.plan, 'thu', 'lunch'), { menuId: '백반', tags: ['fish'] });
    Object.assign(cellAt(ctx.plan, 'fri', 'lunch'), { menuId: '백반', tags: ['fish'] });
    expect(run(ctx).violations).toEqual([
      { rule: 'consecutive_menu', cells: [s('thu', 'lunch'), s('fri', 'lunch')], regenerate: [s('fri', 'lunch')] },
    ]);
  });

  it('8. 외식 칸이 메뉴 목록에 없음', () => {
    const ctx = setup();
    Object.assign(cellAt(ctx.plan, 'wed', 'lunch'), { menuId: '짜장면', tags: ['wheat', 'refined_carb_main'] });
    expect(run(ctx).violations).toEqual([
      { rule: 'eat_out_not_in_list', cells: [s('wed', 'lunch')], regenerate: [s('wed', 'lunch')] },
    ]);
  });

  it('9. 집밥 조리 시간 초과', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'mon', 'dinner').cookMinutes = 30;
    expect(run(ctx).violations).toEqual([
      { rule: 'cook_time_exceeded', cells: [s('mon', 'dinner')], regenerate: [s('mon', 'dinner')] },
    ]);
  });

  it('10. 조리 시간 설정이 없으면 점검하지 않는다', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'sat', 'dinner').cookMinutes = 90;
    expect(run(ctx).violations).toEqual([]);
  });

  it('11. 이유의 근거가 식단 기준에 없음', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'mon', 'dinner').criterionIds.push('reduce_refined_carbs');
    expect(run(ctx).violations).toEqual([
      { rule: 'reason_criterion', cells: [s('mon', 'dinner')], regenerate: [s('mon', 'dinner')] },
    ]);
  });

  it('11-1. 이유의 근거가 비어 있음', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'mon', 'dinner').criterionIds = [];
    expect(run(ctx).violations).toEqual([
      { rule: 'reason_criterion', cells: [s('mon', 'dinner')], regenerate: [s('mon', 'dinner')] },
    ]);
  });

  it('12. 채워야 할 끼니가 빠짐', () => {
    const ctx = setup();
    removeCell(ctx.plan, 'tue', 'dinner');
    expect(run(ctx).violations).toEqual([
      { rule: 'missing_cell', cells: [s('tue', 'dinner')], regenerate: [s('tue', 'dinner')] },
    ]);
  });

  it('13. 거르는 끼니에 칸이 있음', () => {
    const ctx = setup();
    ctx.plan.cells.push({ ...cellAt(ctx.plan, 'mon', 'dinner'), day: 'mon', meal: 'breakfast', menuId: '토스트' });
    expect(run(ctx).violations).toEqual([
      { rule: 'unexpected_cell', cells: [s('mon', 'breakfast')], regenerate: [] },
    ]);
  });

  it('14. 같은 끼니에 칸이 두 개면 두 번째 칸만 걸리고 다른 규칙에서 빠진다', () => {
    const ctx = setup();
    ctx.plan.cells.push(structuredClone(cellAt(ctx.plan, 'mon', 'lunch')));
    expect(run(ctx).violations).toEqual([
      { rule: 'unexpected_cell', cells: [s('mon', 'lunch')], regenerate: [] },
    ]);
  });

  it('15. meat를 피하면 구체적인 고기 태그도 걸린다', () => {
    const ctx = setup();
    ctx.profile.avoid = ['meat'];
    const v = (day: Day, meal: MealType, detail: string) => ({
      rule: 'avoid_tag',
      cells: [s(day, meal)],
      regenerate: [s(day, meal)],
      detail,
    });
    expect(run(ctx).violations).toEqual([
      v('tue', 'dinner', 'meat,chicken'),
      v('wed', 'lunch', 'meat,beef'),
      v('thu', 'lunch', 'meat,pork'),
      v('fri', 'lunch', 'meat,beef'),
      v('sun', 'dinner', 'meat,chicken'),
    ]);
  });

  it('15-1. meat 태그 없이 pork만 붙어도 걸린다', () => {
    const ctx = setup();
    ctx.profile.avoid = ['meat'];
    for (const c of ctx.plan.cells) c.tags = c.tags.filter((t) => t !== 'meat' && t !== 'beef' && t !== 'chicken');
    expect(run(ctx).violations).toEqual([
      { rule: 'avoid_tag', cells: [s('thu', 'lunch')], regenerate: [s('thu', 'lunch')], detail: 'pork' },
    ]);
  });

  it('16. 여러 위반은 규칙 순서로 정렬된다', () => {
    const ctx = setup();
    cellAt(ctx.plan, 'tue', 'dinner').tags.push('dairy');
    Object.assign(cellAt(ctx.plan, 'tue', 'lunch'), { menuId: '국밥', tags: ['meat', 'beef'] });
    cellAt(ctx.plan, 'mon', 'dinner').cookMinutes = 30;
    expect(run(ctx).violations.map((v) => v.rule)).toEqual([
      'avoid_tag',
      'class_weekly_limit',
      'cook_time_exceeded',
    ]);
  });
});
