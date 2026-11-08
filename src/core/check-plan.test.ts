// 스펙 8.2
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { classesG, profileG } from './__fixtures__/personas.ts';
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

  it('7. 일정이 있는 끼니를 건너뛰고 이어 본다 (같은 끼니 연속 요일로 중복 보고하지 않음)', () => {
    const ctx = setup();
    removeCell(ctx.plan, 'sat', 'dinner');
    ctx.plan.events.push({ day: 'sat', meal: 'dinner', note: '가족 외식' });
    cellAt(ctx.plan, 'sun', 'lunch').menuId = '비빔밥';
    expect(run(ctx).violations).toEqual([
      { rule: 'consecutive_menu', cells: [s('sat', 'lunch'), s('sun', 'lunch')], regenerate: [s('sun', 'lunch')] },
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

  describe('메뉴 다양성 (열린 질문 8)', () => {
    it('17. 띄어쓰기만 다른 이름은 같은 메뉴로 본다', () => {
      const ctx = setup();
      cellAt(ctx.plan, 'sat', 'dinner').menuId = '비 빔밥';
      expect(run(ctx).violations).toEqual([
        { rule: 'consecutive_menu', cells: [s('sat', 'lunch'), s('sat', 'dinner')], regenerate: [s('sat', 'dinner')] },
      ]);
    });

    it('18. 같은 끼니 연속 요일 (저녁)', () => {
      const ctx = setup();
      cellAt(ctx.plan, 'tue', 'dinner').menuId = '두부 채소 볶음';
      const result = run(ctx);
      expect(result.violations).toEqual([
        {
          rule: 'same_meal_consecutive_days',
          cells: [s('mon', 'dinner'), s('tue', 'dinner')],
          regenerate: [s('tue', 'dinner')],
        },
      ]);
      expect(result.stats.consecutiveCount).toBe(1);
    });

    it('18-1. 같은 끼니 연속 요일도 띄어쓰기를 무시한다', () => {
      const ctx = setup();
      cellAt(ctx.plan, 'tue', 'dinner').menuId = '두부채소볶음';
      expect(run(ctx).violations.map((v) => v.rule)).toEqual(['same_meal_consecutive_days']);
    });

    it('19. 같은 끼니 연속 요일 (외식 점심)', () => {
      const ctx = setup();
      Object.assign(cellAt(ctx.plan, 'tue', 'lunch'), { menuId: '회덮밥', tags: ['fish'] });
      expect(run(ctx).violations).toEqual([
        {
          rule: 'same_meal_consecutive_days',
          cells: [s('mon', 'lunch'), s('tue', 'lunch')],
          regenerate: [s('tue', 'lunch')],
        },
      ]);
    });

    it('20. 하루 건너 같은 메뉴는 주 2회까지 괜찮다', () => {
      const ctx = setup();
      Object.assign(cellAt(ctx.plan, 'wed', 'lunch'), { menuId: '회덮밥', tags: ['fish'] });
      expect(run(ctx).violations).toEqual([]);
    });

    it('20-1. 일정이 있는 날은 연속 요일을 끊는다', () => {
      const ctx = setup();
      removeCell(ctx.plan, 'tue', 'lunch');
      ctx.plan.events.push({ day: 'tue', meal: 'lunch', note: '거래처 점심' });
      Object.assign(cellAt(ctx.plan, 'wed', 'lunch'), { menuId: '회덮밥', tags: ['fish'] });
      expect(run(ctx).violations).toEqual([]);
    });

    it('21. 같은 메뉴 주 3회', () => {
      const ctx = setup();
      Object.assign(cellAt(ctx.plan, 'wed', 'lunch'), { menuId: '회덮밥', tags: ['fish'] });
      Object.assign(cellAt(ctx.plan, 'fri', 'lunch'), { menuId: '회덮밥', tags: ['fish'] });
      expect(run(ctx).violations).toEqual([
        {
          rule: 'menu_weekly_limit',
          cells: [s('mon', 'lunch'), s('wed', 'lunch'), s('fri', 'lunch')],
          regenerate: [s('fri', 'lunch')],
          detail: '회덮밥',
        },
      ]);
    });

    it('21-1. 집밥도 띄어쓰기를 무시하고 센다', () => {
      const ctx = setup();
      cellAt(ctx.plan, 'wed', 'dinner').menuId = '두부채소 볶음';
      cellAt(ctx.plan, 'fri', 'dinner').menuId = '두부 채소볶음';
      expect(run(ctx).violations).toEqual([
        {
          rule: 'menu_weekly_limit',
          cells: [s('mon', 'dinner'), s('wed', 'dinner'), s('fri', 'dinner')],
          regenerate: [s('fri', 'dinner')],
          detail: '두부 채소 볶음', // 처음 나온 칸의 이름
        },
      ]);
    });

    it('22. 주 1회 이하로 분류된 메뉴는 더 엄격한 규칙만 적용한다', () => {
      const ctx = setup();
      Object.assign(cellAt(ctx.plan, 'thu', 'lunch'), { menuId: '백반', tags: ['fish'] });
      for (const day of ['mon', 'wed', 'fri'] as const) {
        Object.assign(cellAt(ctx.plan, day, 'lunch'), { menuId: '돈가스', tags: ['meat', 'pork', 'fried', 'wheat'] });
      }
      expect(run(ctx).violations.map((v) => v.rule)).toEqual(['class_weekly_limit', 'tag_weekly_limit']);
    });

    it('23. 이어진 칸이면 같은 끼니 연속 요일로 중복 보고하지 않는다', () => {
      const ctx = setup();
      ctx.profile.meals.find((m) => m.dayType === 'weekday' && m.meal === 'dinner')!.place = 'skip';
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) removeCell(ctx.plan, day, 'dinner');
      Object.assign(cellAt(ctx.plan, 'tue', 'lunch'), { menuId: '회덮밥', tags: ['fish'] });
      expect(run(ctx).violations).toEqual([
        { rule: 'consecutive_menu', cells: [s('mon', 'lunch'), s('tue', 'lunch')], regenerate: [s('tue', 'lunch')] },
      ]);
    });
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

// B15 T11-2: 같은 메뉴 허용 횟수는 사전 점검(plan-feasibility.ts)이 프로필·분류·일정으로 정한다
describe('checkPlan: 외식 메뉴가 적을 때 같은 메뉴 허용 횟수', () => {
  /** 페르소나 G: 평일 점심 외식(비빔밥·칼국수), 평일 저녁 집밥 30분, 주말 집밥 */
  function planG(lunches: Partial<Record<Day, string>>, events: Slot[] = []): Plan {
    const cell = (day: Day, meal: MealType, place: 'home' | 'eat_out', menuId: string): PlanCell => ({
      day,
      meal,
      place,
      menuId,
      title: menuId,
      ingredients: [],
      tags: [],
      cookMinutes: place === 'home' ? 20 : 0,
      reason: '이유',
      criterionIds: ['reduce_portion_calories'],
    });
    const cells: PlanCell[] = [];
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
      const weekday = day !== 'sat' && day !== 'sun';
      const lunch = lunches[day];
      if (weekday && lunch) cells.push(cell(day, 'lunch', 'eat_out', lunch));
      if (!weekday) cells.push(cell(day, 'lunch', 'home', `${day} 점심 집밥`));
      cells.push(cell(day, 'dinner', 'home', `${day} 저녁 집밥`));
    }
    return { ...structuredClone(planA), events: events.map((e) => ({ ...e, note: '일정' })), cells };
  }
  const rulesG = { criteria: ['reduce_portion_calories' as const], tagLimits: {} };

  it('평일 점심 5칸을 메뉴 2개로 채우면 같은 메뉴 3번까지 허용된다', () => {
    const plan = planG({ mon: '비빔밥', tue: '칼국수', wed: '비빔밥', thu: '칼국수', fri: '비빔밥' });
    expect(checkPlan(plan, profileG, classesG, rulesG).violations).toEqual([]);
  });

  it('일정으로 평일 점심이 4칸이면 기본(2번)이라 같은 메뉴 3번은 위반이다', () => {
    const events = [{ day: 'tue' as const, meal: 'lunch' as const }];
    const plan = planG({ mon: '비빔밥', wed: '비빔밥', thu: '칼국수', fri: '비빔밥' }, events);
    expect(checkPlan(plan, profileG, classesG, rulesG).violations).toEqual([
      {
        rule: 'menu_weekly_limit',
        cells: [
          { day: 'mon', meal: 'lunch' },
          { day: 'wed', meal: 'lunch' },
          { day: 'fri', meal: 'lunch' },
        ],
        regenerate: [{ day: 'fri', meal: 'lunch' }],
        detail: '비빔밥',
      },
    ]);
  });

  // T18: 같은 주재료 (집밥 칸만, mainIngredient가 있는 칸만)
  describe('같은 주재료', () => {
    const main = (plan: Plan, day: Day, meal: MealType, value: string) => {
      cellAt(plan, day, meal).mainIngredient = value;
    };

    it('24. 이어진 두 집밥 칸의 주재료가 같으면 뒤쪽 칸을 다시 추천', () => {
      const ctx = setup();
      main(ctx.plan, 'sat', 'lunch', '두부');
      main(ctx.plan, 'sat', 'dinner', '두부');
      expect(run(ctx).violations).toEqual([
        { rule: 'main_ingredient_consecutive', cells: [s('sat', 'lunch'), s('sat', 'dinner')], regenerate: [s('sat', 'dinner')], detail: '두부' },
      ]);
    });

    it('25. 같은 메뉴로 이어졌으면 consecutive_menu만 보고한다', () => {
      const ctx = setup();
      cellAt(ctx.plan, 'sat', 'dinner').menuId = '비빔밥';
      main(ctx.plan, 'sat', 'lunch', '두부');
      main(ctx.plan, 'sat', 'dinner', '두부');
      expect(run(ctx).violations).toEqual([
        { rule: 'consecutive_menu', cells: [s('sat', 'lunch'), s('sat', 'dinner')], regenerate: [s('sat', 'dinner')] },
      ]);
    });

    it('26. 한쪽이 외식이면 보지 않는다', () => {
      const ctx = setup();
      main(ctx.plan, 'fri', 'lunch', '소고기');
      main(ctx.plan, 'fri', 'dinner', '소고기');
      expect(run(ctx).violations).toEqual([]);
    });

    it('27. 같은 주재료 집밥이 주 4번이면 4번째 칸을 다시 추천, 3번은 괜찮다', () => {
      const ctx = setup();
      for (const day of ['mon', 'wed', 'fri'] as const) main(ctx.plan, day, 'dinner', '닭가슴살');
      expect(run(ctx).violations).toEqual([]);
      main(ctx.plan, 'sun', 'dinner', '닭가슴살');
      expect(run(ctx).violations).toEqual([
        {
          rule: 'main_ingredient_weekly_limit',
          cells: [s('mon', 'dinner'), s('wed', 'dinner'), s('fri', 'dinner'), s('sun', 'dinner')],
          regenerate: [s('sun', 'dinner')],
          detail: '닭가슴살',
        },
      ]);
    });

    it('28. 공백만 다른 주재료는 같다', () => {
      const ctx = setup();
      main(ctx.plan, 'sat', 'lunch', '닭 가슴살');
      main(ctx.plan, 'sat', 'dinner', '닭가슴살 ');
      expect(run(ctx).violations.map((v) => v.rule)).toEqual(['main_ingredient_consecutive']);
    });

    it('29. 주재료가 없는 칸은 빠진다 (예전 식단표, 데모 픽스처)', () => {
      const ctx = setup();
      main(ctx.plan, 'sat', 'lunch', '두부');
      expect(run(ctx).passed).toBe(true);
    });
  });

  // T19-2·3 (2차 코드 리뷰): 칸의 외식·집밥이 끼니 설정과 달라도, 분류된 메뉴를 집밥 칸에 넣어도 걸리지 않았다
  describe('끼니 설정과 다른 칸, 분류된 메뉴의 집밥 칸', () => {
    it('30. 외식 끼니(수 점심)에 집밥 칸', () => {
      const ctx = setup();
      Object.assign(cellAt(ctx.plan, 'wed', 'lunch'), { place: 'home', menuId: '현미 도시락', title: '현미 도시락' });
      expect(run(ctx).violations).toEqual([{ rule: 'place_mismatch', cells: [s('wed', 'lunch')], regenerate: [s('wed', 'lunch')] }]);
    });

    it('31. 집밥 끼니(일 저녁)에 외식 칸', () => {
      const ctx = setup();
      Object.assign(cellAt(ctx.plan, 'sun', 'dinner'), { place: 'eat_out', menuId: '김밥', title: '김밥' });
      expect(run(ctx).violations).toEqual([
        { rule: 'place_mismatch', cells: [s('sun', 'dinner')], regenerate: [s('sun', 'dinner')] },
        { rule: 'eat_out_not_in_list', cells: [s('sun', 'dinner')], regenerate: [s('sun', 'dinner')] },
      ]);
    });

    it('32. 주 1회로 분류된 메뉴도 집밥 칸이면 같은 메뉴 횟수를 센다', () => {
      const ctx = setup();
      for (const day of ['mon', 'fri', 'sun'] as const) Object.assign(cellAt(ctx.plan, day, 'dinner'), { menuId: '돈가스', title: '돈가스' });
      expect(run(ctx).violations).toEqual([
        {
          rule: 'menu_weekly_limit',
          cells: [s('mon', 'dinner'), s('fri', 'dinner'), s('sun', 'dinner')],
          regenerate: [s('sun', 'dinner')],
          detail: '돈가스',
        },
      ]);
    });
  });
});
