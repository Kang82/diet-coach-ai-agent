// tasks.md B15 T11-1: 외식 메뉴로 규칙(같은 메뉴 횟수, 주 1회 메뉴, 바로 앞 끼니·같은 끼니 전날 금지)을 지키는 배치가 있는지
import { describe, expect, it } from 'vitest';
import { classesA, profileA } from './__fixtures__/persona-a.ts';
import {
  classesB,
  classesC,
  classesD,
  classesE,
  classesF,
  classesG,
  profileB,
  profileC,
  profileD,
  profileE,
  profileF,
  profileG,
} from './__fixtures__/personas.ts';
import { checkPlan } from './check-plan.ts';
import { buildCriteria } from './criteria.ts';
import { classStepWarning, findEatOutAssignment, planFeasibility, profileStepHint, shortMealsMessage } from './plan-feasibility.ts';
import type { MealSetting, MenuClassification, Plan, PlanCell, Profile, Slot } from './types.ts';

const tueLunch: Slot = { day: 'tue', meal: 'lunch' };

/** 평일 점심만 외식(메뉴 지정), 나머지는 건너뛰거나 집밥 */
function lunchOnly(menus: string[], dinner: MealSetting['place'] = 'home'): Profile {
  return {
    ...structuredClone(profileG),
    meals: profileG.meals.map((m) =>
      m.dayType === 'weekday' && m.meal === 'lunch'
        ? { ...m, menus }
        : m.dayType === 'weekday' && m.meal === 'dinner'
          ? { ...m, place: dinner, ...(dinner === 'eat_out' ? { menus: ['국밥'] } : {}) }
          : m,
    ),
  };
}

const often = (menu: string): MenuClassification => ({ menu, class: 'often', reason: '이유', criterionIds: ['reduce_portion_calories'], orderTips: [] });
const weekly1 = (menu: string): MenuClassification => ({ ...often(menu), class: 'weekly_max_1' });
const avoid = (menu: string): MenuClassification => ({ ...often(menu), class: 'avoid' });

describe('planFeasibility', () => {
  it.each([
    ['A', profileA, classesA],
    ['B', profileB, classesB],
    ['C', profileC, classesC],
    ['D', profileD, classesD],
    ['E', profileE, classesE],
  ] as const)('페르소나 %s는 지금 규칙(같은 메뉴 주 2번)으로 된다', (_, profile, classes) => {
    expect(planFeasibility(profile, classes, [])).toEqual({ feasible: true, menuWeeklyMax: 2 });
  });

  it('페르소나 G: 평일 점심 5칸을 메뉴 2개로 번갈아 채우려면 같은 메뉴 주 3번이 필요하다', () => {
    expect(planFeasibility(profileG, classesG, [])).toEqual({ feasible: true, menuWeeklyMax: 3 });
  });

  it('페르소나 G에 일정으로 평일 점심 하루를 빼면 주 2번으로 된다', () => {
    expect(planFeasibility(profileG, classesG, [tueLunch])).toEqual({ feasible: true, menuWeeklyMax: 2 });
  });

  it('페르소나 F(사용자 모양, 화요일 점심 일정)는 횟수를 늘려도 불가능하고, 평일 점심이나 저녁에 메뉴 하나만 더 있으면 된다', () => {
    expect(planFeasibility(profileF, classesF, [tueLunch])).toEqual({
      feasible: false,
      shortMeals: [{ dayType: 'weekday', meal: 'lunch' }, { dayType: 'weekday', meal: 'dinner' }],
    });
  });

  it('페르소나 F에 일정이 없으면 평일 점심 5일이 이어져 점심 메뉴를 더해야만 된다', () => {
    expect(planFeasibility(profileF, classesF, [])).toEqual({ feasible: false, shortMeals: [{ dayType: 'weekday', meal: 'lunch' }] });
  });

  it('외식 메뉴가 하나뿐인 끼니가 이틀 이상 이어지면 불가능하고 그 끼니가 모자란다', () => {
    expect(planFeasibility(lunchOnly(['비빔밥']), [often('비빔밥')], [])).toEqual({
      feasible: false,
      shortMeals: [{ dayType: 'weekday', meal: 'lunch' }],
    });
  });

  it('피하기로 분류한 메뉴는 고를 수 없다', () => {
    const profile = lunchOnly(['비빔밥', '칼국수', '돈가스']);
    expect(planFeasibility(profile, [often('비빔밥'), often('칼국수'), often('돈가스')], [])).toEqual({ feasible: true, menuWeeklyMax: 2 });
    expect(planFeasibility(profile, [often('비빔밥'), often('칼국수'), avoid('돈가스')], [])).toEqual({ feasible: true, menuWeeklyMax: 3 });
  });

  it('주 1회 메뉴는 횟수를 늘려도 1번이다', () => {
    // 비빔밥(자주) + 칼국수(주 1회)로 평일 점심 5칸: 칼국수 1번이면 비빔밥이 연달아 들어가야 해 불가능
    expect(planFeasibility(lunchOnly(['비빔밥', '칼국수']), [often('비빔밥'), weekly1('칼국수')], []).feasible).toBe(false);
  });

  it('분류에 없는 메뉴는 자주(often)로 본다', () => {
    expect(planFeasibility(lunchOnly(['비빔밥', '칼국수']), [], [])).toEqual({ feasible: true, menuWeeklyMax: 3 });
  });

  it('끼니 사이 같은 이름 메뉴는 함께 센다 (공백만 다른 이름도 같은 메뉴)', () => {
    // 점심 A·B, 저녁 A만: 저녁 5칸이 모두 A라 같은 끼니 전날 금지로 불가능
    const profile: Profile = {
      ...lunchOnly(['비빔밥', '칼국수'], 'eat_out'),
    };
    profile.meals = profile.meals.map((m) => (m.dayType === 'weekday' && m.meal === 'dinner' ? { ...m, menus: ['비 빔밥'] } : m));
    expect(planFeasibility(profile, [], []).feasible).toBe(false);
  });
});

describe('findEatOutAssignment', () => {
  /** 배치로 1주일 식단표를 만든다. 집밥 칸은 서로 다른 메뉴 */
  function planFrom(profile: Profile, classes: MenuClassification[], events: Slot[], k: number): Plan {
    const assignment = findEatOutAssignment(profile, classes, events, k);
    expect(assignment).toBeDefined();
    const cells: PlanCell[] = [...assignment!].map(([slot, menu], i) => ({
      day: slot.day,
      meal: slot.meal,
      place: menu === undefined ? 'home' : 'eat_out',
      menuId: menu ?? `집밥${i}`,
      title: menu ?? `집밥${i}`,
      ingredients: [],
      tags: [],
      cookMinutes: 0,
      reason: '이유',
      criterionIds: [buildCriteria(profile.goals).criteria[0]!],
    }));
    return {
      planId: 'p',
      userId: profile.userId,
      profileVersion: 1,
      weekStart: '2026-11-09',
      events: events.map((e) => ({ ...e, note: '일정' })),
      cells,
      createdAt: '2026-11-08T00:00:00Z',
    };
  }

  it.each([
    ['G', profileG, classesG, [] as Slot[], 3],
    ['G 일정', profileG, classesG, [tueLunch], 2],
    ['E', profileE, classesE, [] as Slot[], 2],
  ] as const)('페르소나 %s: 찾은 배치는 checkPlan의 메뉴 규칙을 모두 지킨다', (_, profile, classes, events, k) => {
    const plan = planFrom(profile, [...classes], [...events], k);
    const rules = buildCriteria(profile.goals);
    const menuRules = ['consecutive_menu', 'same_meal_consecutive_days', 'menu_weekly_limit', 'class_weekly_limit', 'class_avoid', 'eat_out_not_in_list'];
    const violations = checkPlan(plan, profile, [...classes], rules).violations.filter((v) => menuRules.includes(v.rule));
    expect(violations).toEqual([]);
  });

  it('불가능하면 undefined', () => {
    expect(findEatOutAssignment(profileF, classesF, [], 7)).toBeUndefined();
  });
});

describe('shortMealsMessage', () => {
  it('모자란 끼니를 한국어로 알린다', () => {
    expect(shortMealsMessage([{ dayType: 'weekday', meal: 'lunch' }])).toBe(
      '평일 점심 외식 메뉴가 적어 규칙에 맞는 식단표를 만들 수 없어요. 평일 점심에 외식 메뉴를 더 넣어 주세요.',
    );
    expect(shortMealsMessage([{ dayType: 'weekday', meal: 'lunch' }, { dayType: 'weekday', meal: 'dinner' }])).toBe(
      '평일 점심, 평일 저녁 외식 메뉴가 적어 규칙에 맞는 식단표를 만들 수 없어요. 평일 점심이나 평일 저녁에 외식 메뉴를 더 넣어 주세요.',
    );
  });
});

// B15 T11-4: 화면 미리 알림
describe('화면 미리 알림', () => {
  it('분류 확인 화면: 바꾼 분류와 일정으로 불가능하면 만들기 막는 문구, 가능하면 없음', () => {
    expect(classStepWarning(profileF, classesF, [tueLunch])).toBe(shortMealsMessage([{ dayType: 'weekday', meal: 'lunch' }, { dayType: 'weekday', meal: 'dinner' }]));
    expect(classStepWarning(profileG, classesG, [])).toBeUndefined();
    // 사용자가 메뉴 하나를 피하기로 바꾸면 불가능해질 수 있다
    expect(classStepWarning(profileG, [often('비빔밥'), avoid('칼국수')], [])).toBe(shortMealsMessage([{ dayType: 'weekday', meal: 'lunch' }]));
  });

  it('프로필 확인 화면: 분류 전이라 모든 메뉴를 자주(often)로 보고, 그래도 불가능하면 메뉴를 더 넣으라고 알린다', () => {
    expect(profileStepHint(profileG)).toBeUndefined();
    expect(profileStepHint(lunchOnly(['비빔밥']))).toBe(
      '평일 점심 외식 메뉴가 적어 식단표를 만들기 어려워요. 같은 메뉴는 바로 앞 끼니나 전날 같은 끼니에 다시 넣지 않아서, 평일 점심에 메뉴를 더 넣어 주세요.',
    );
    // 페르소나 F는 주 1회 분류 전에는(모두 자주) 가능하다
    expect(profileStepHint(profileF)).toBeUndefined();
  });
});
