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
import { dayType, menuKey, slotOrder } from './helpers.ts';
import {
  classStepWarning,
  findEatOutAssignment,
  fixSuggestions,
  mealGroupLabel,
  mealGroups,
  planFeasibility,
  profileStepHint,
  shortMealsMessage,
} from './plan-feasibility.ts';
import { requiredSlots } from './plan-slots.ts';
import { DAYS } from './types.ts';
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

describe('planFeasibility: 분류 태그의 1주일 횟수 제한 (T13-4)', () => {
  const tagged = (menu: string, ...tags: NonNullable<MenuClassification['tags']>): MenuClassification => ({ ...often(menu), tags });
  const withGoals = (profile: Profile, goals: Profile['goals']): Profile => ({ ...profile, goals });
  const noodles = [tagged('라면', 'wheat', 'refined_carb_main'), tagged('우동', 'wheat', 'refined_carb_main'), tagged('파스타', 'wheat', 'refined_carb_main')];

  it('혈당 목표(흰 면·빵 주 2번)에 평일 점심 메뉴가 모두 흰 면이면 불가능하고, 평일 점심이 모자란다', () => {
    const profile = withGoals(lunchOnly(['라면', '우동', '파스타']), ['blood_glucose']);
    expect(planFeasibility(profile, noodles, [])).toEqual({ feasible: false, shortMeals: [{ dayType: 'weekday', meal: 'lunch' }] });
  });

  it('제한 태그가 없는 메뉴가 하나 있으면 그 메뉴를 늘려 가능하다 (흰 면 2번 + 비빔밥 3번)', () => {
    const profile = withGoals(lunchOnly(['라면', '우동', '파스타', '비빔밥']), ['blood_glucose']);
    expect(planFeasibility(profile, [...noodles, tagged('비빔밥', 'egg')], [])).toEqual({ feasible: true, menuWeeklyMax: 3 });
  });

  it('제한이 없는 목표(콜레스테롤)면 같은 메뉴로 가능하다', () => {
    const profile = withGoals(lunchOnly(['라면', '우동', '파스타']), ['cholesterol']);
    expect(planFeasibility(profile, noodles, [])).toEqual({ feasible: true, menuWeeklyMax: 2 });
  });

  it('한도 0인 태그(혈당 목표의 단 음식) 메뉴는 고를 수 없다', () => {
    const profile = withGoals(lunchOnly(['비빔밥', '김밥', '떡볶이']), ['blood_glucose']);
    expect(planFeasibility(profile, [tagged('비빔밥'), tagged('김밥'), tagged('떡볶이', 'sugary')], [])).toEqual({ feasible: true, menuWeeklyMax: 3 });
    expect(planFeasibility(profile, [tagged('비빔밥'), tagged('김밥'), tagged('떡볶이')], [])).toEqual({ feasible: true, menuWeeklyMax: 2 });
  });

  it('찾은 배치는 태그 한도를 지킨다', () => {
    const profile = withGoals(lunchOnly(['라면', '우동', '파스타', '비빔밥']), ['blood_glucose']);
    const classes = [...noodles, tagged('비빔밥', 'egg')];
    const found = findEatOutAssignment(profile, classes, [], 3);
    if (!Array.isArray(found)) throw new Error(String(found));
    const tagsOf = new Map(classes.map((c) => [c.menu, c.tags ?? []]));
    expect(found.filter(([, menu]) => menu && tagsOf.get(menu)!.includes('refined_carb_main')).length).toBeLessThanOrEqual(2);
  });
});

describe('findEatOutAssignment', () => {
  /** 배치로 1주일 식단표를 만든다. 집밥 칸은 서로 다른 메뉴 */
  function planFrom(profile: Profile, classes: MenuClassification[], events: Slot[], k: number): Plan {
    const assignment = findEatOutAssignment(profile, classes, events, k);
    if (assignment === undefined || assignment === 'unknown') throw new Error('배치가 없음');
    const cells: PlanCell[] = assignment.map(([slot, menu], i) => ({
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

  it('탐색 노드 상한을 넘으면 unknown', () => {
    expect(findEatOutAssignment(profileG, classesG, [], 3, 1)).toBe('unknown');
  });

  it('작은 무작위 프로필 300개: 기존 시간순 탐색과 가능 여부가 같고, 찾은 배치는 규칙을 지킨다', () => {
    const random = seeded(20261108);
    const pool = ['국밥', '백반', '쌀국수', '국 밥', '덮밥'];
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const seen = { feasible: 0, infeasible: 0 };
    for (let n = 0; n < 300; n++) {
      const meals = profileG.meals.map((m): MealSetting => {
        const place = pick(['skip', 'home', 'home', 'eat_out'] as const);
        if (place !== 'eat_out') return { dayType: m.dayType, meal: m.meal, place, companions: 'alone' };
        const count = 1 + Math.floor(random() * 3);
        return { dayType: m.dayType, meal: m.meal, place, companions: 'alone', menus: Array.from({ length: count }, () => pick(pool)) };
      });
      const profile: Profile = { ...structuredClone(profileG), meals };
      const classes = pool.flatMap((menu) => {
        const c = pick(['often', 'weekly_max_1', 'avoid', 'none'] as const);
        return c === 'none' ? [] : [{ ...often(menu), class: c }];
      });
      const events: Slot[] = random() < 0.3 ? [{ day: pick(['mon', 'wed', 'sat'] as const), meal: pick(['lunch', 'dinner'] as const) }] : [];
      for (let k = 2; k <= 7; k++) {
        const found = findEatOutAssignment(profile, classes, events, k);
        expect(found === undefined, `프로필 ${n}, k=${k}`).toBe(referenceSearch(profile, classes, events, k) === undefined);
        seen[found === undefined ? 'infeasible' : 'feasible']++;
        if (found !== undefined) {
          expect(found).not.toBe('unknown');
          const plan = planFrom(profile, classes, events, k);
          const menuRules = ['consecutive_menu', 'same_meal_consecutive_days', 'class_weekly_limit', 'class_avoid', 'eat_out_not_in_list'];
          const counts = new Map<string, number>();
          for (const cell of plan.cells) if (cell.place === 'eat_out') counts.set(cell.menuId.replace(/\s/g, ''), (counts.get(cell.menuId.replace(/\s/g, '')) ?? 0) + 1);
          expect(Math.max(0, ...counts.values()), `프로필 ${n}, k=${k}`).toBeLessThanOrEqual(k);
          const violations = checkPlan(plan, profile, classes, buildCriteria(profile.goals)).violations.filter((v) => menuRules.includes(v.rule));
          expect(violations, `프로필 ${n}, k=${k}`).toEqual([]);
        }
      }
    }
    // 가능·불가능이 고루 나와야 비교가 의미 있다
    expect(seen.feasible).toBeGreaterThan(200);
    expect(seen.infeasible).toBeGreaterThan(200);
  });
});

// T19-1 (2차 코드 리뷰): 앞쪽 끼니에 메뉴가 많고 뒤쪽(주말)이 불가능하면 시간순 백트래킹이 앞쪽 조합을 다 돌았다
describe('사전 점검 속도', () => {
  const menus = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const weekdayAllEatOut = (weekend: MealSetting[]): Profile => ({
    ...structuredClone(profileG),
    meals: [
      { dayType: 'weekday', meal: 'breakfast', place: 'eat_out', companions: 'alone', menus: menus('아침', 20) },
      { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'alone', menus: menus('점심', 20) },
      { dayType: 'weekday', meal: 'dinner', place: 'eat_out', companions: 'alone', menus: menus('저녁', 20) },
      ...weekend,
    ],
  });

  it('평일 세 끼 메뉴 20개씩 + 주말 저녁 메뉴 1개: 바로 불가능, 주말 저녁이 모자란다', () => {
    const profile = weekdayAllEatOut([
      { dayType: 'weekend', meal: 'breakfast', place: 'skip', companions: 'alone' },
      { dayType: 'weekend', meal: 'lunch', place: 'home', companions: 'alone' },
      { dayType: 'weekend', meal: 'dinner', place: 'eat_out', companions: 'alone', menus: ['치킨'] },
    ]);
    const started = performance.now();
    expect(planFeasibility(profile, [], [])).toEqual({ feasible: false, shortMeals: [{ dayType: 'weekend', meal: 'dinner' }] });
    expect(profileStepHint(profile)).toBeDefined();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('주말 점심·저녁이 같은 메뉴 2개뿐: 바로 불가능', () => {
    const profile = weekdayAllEatOut([
      { dayType: 'weekend', meal: 'breakfast', place: 'skip', companions: 'alone' },
      { dayType: 'weekend', meal: 'lunch', place: 'eat_out', companions: 'alone', menus: ['치킨', '피자'] },
      { dayType: 'weekend', meal: 'dinner', place: 'eat_out', companions: 'alone', menus: ['치킨', '피자'] },
    ]);
    const started = performance.now();
    expect(planFeasibility(profile, [], []).feasible).toBe(false);
    expect(fixSuggestions(profile, [weekly1('치킨')], [])).not.toEqual([]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('메뉴가 많고 가능한 프로필도 바로 찾는다', () => {
    const profile = weekdayAllEatOut([
      { dayType: 'weekend', meal: 'breakfast', place: 'eat_out', companions: 'alone', menus: menus('주말아침', 3) },
      { dayType: 'weekend', meal: 'lunch', place: 'eat_out', companions: 'alone', menus: menus('점심', 20) },
      { dayType: 'weekend', meal: 'dinner', place: 'eat_out', companions: 'alone', menus: ['치킨', '피자'] },
    ]);
    const started = performance.now();
    expect(planFeasibility(profile, [], [])).toEqual({ feasible: true, menuWeeklyMax: 2 });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

/** 결정적인 무작위 수 (mulberry32) */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** T19-1 전의 시간순 백트래킹(참조 구현). 작은 프로필에서 새 탐색과 결과를 견준다 */
function referenceSearch(profile: Profile, classes: readonly MenuClassification[], events: readonly Slot[], weeklyMax: number): true | undefined {
  const slots = requiredSlots(profile, events);
  const classOf = new Map(classes.map((c) => [c.menu, c.class]));
  const candidatesOf = slots.map((slot) => {
    const setting = profile.meals.find((m) => m.dayType === dayType(slot.day) && m.meal === slot.meal);
    if (setting?.place !== 'eat_out') return undefined;
    const seen = new Set<string>();
    return (setting.menus ?? []).filter((menu) => {
      const key = menuKey(menu);
      if (classOf.get(menu) === 'avoid' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const limitOf = new Map<string, number>();
  for (const list of candidatesOf) {
    for (const menu of list ?? []) {
      const key = menuKey(menu);
      const limit = classOf.get(menu) === 'weekly_max_1' ? 1 : weeklyMax;
      limitOf.set(key, Math.min(limitOf.get(key) ?? limit, limit));
    }
  }
  const keyAt = new Map<number, string>();
  const used = new Map<string, number>();
  const search = (i: number): boolean => {
    if (i === slots.length) return true;
    const slot = slots[i]!;
    const order = slotOrder(slot);
    const candidates = candidatesOf[i];
    if (candidates === undefined) {
      keyAt.set(order, `\u0000home${i}`);
      if (search(i + 1)) return true;
      keyAt.delete(order);
      return false;
    }
    const prevKey = i > 0 ? keyAt.get(slotOrder(slots[i - 1]!)) : undefined;
    const d = DAYS.indexOf(slot.day);
    const sameMealPrev = d > 0 ? keyAt.get(slotOrder({ day: DAYS[d - 1]!, meal: slot.meal })) : undefined;
    for (const menu of candidates) {
      const key = menuKey(menu);
      if (key === prevKey || key === sameMealPrev) continue;
      const count = used.get(key) ?? 0;
      if (count >= (limitOf.get(key) ?? weeklyMax)) continue;
      used.set(key, count + 1);
      keyAt.set(order, key);
      if (search(i + 1)) return true;
      used.set(key, count);
      keyAt.delete(order);
    }
    return false;
  };
  return search(0) ? true : undefined;
}

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

// B16 T12-1: 분류 확인 화면에서 무엇을 고치면 되는지
describe('mealGroups', () => {
  it('외식 끼니마다 칸 수(일정 반영), 쓸 수 있는 메뉴 수, 모자란 끼니를 알린다', () => {
    expect(mealGroups(profileF, classesF, [tueLunch])).toEqual([
      { meal: { dayType: 'weekday', meal: 'lunch' }, slots: 4, menus: ['샐러드', '주먹밥'], usable: 2, weekly1: 1, short: true },
      { meal: { dayType: 'weekday', meal: 'dinner' }, slots: 5, menus: ['샐러드', '덮밥', '토스트'], usable: 3, weekly1: 1, short: true },
    ]);
    expect(mealGroups(profileF, classesF, []).map((g) => g.short)).toEqual([true, false]);
  });

  it('가능하면 모자란 끼니가 없고, 피하기 메뉴는 쓸 수 있는 수에서 뺀다', () => {
    expect(mealGroups(profileG, classesG, [])).toEqual([
      { meal: { dayType: 'weekday', meal: 'lunch' }, slots: 5, menus: ['비빔밥', '칼국수'], usable: 2, weekly1: 0, short: false },
    ]);
    const [group] = mealGroups(lunchOnly(['비빔밥', '칼국수', '돈가스']), [often('비빔밥'), often('칼국수'), avoid('돈가스')], []);
    expect(group).toMatchObject({ usable: 2, weekly1: 0 });
  });

  it('묶음 머리 문구', () => {
    const [lunch, dinner] = mealGroups(profileF, classesF, [tueLunch]);
    expect(mealGroupLabel(lunch!)).toBe('평일 점심 · 4끼 · 쓸 수 있는 메뉴 2개(주 1회 1개)');
    expect(mealGroupLabel(dinner!)).toBe('평일 저녁 · 5끼 · 쓸 수 있는 메뉴 3개(주 1회 1개)');
    expect(mealGroupLabel(mealGroups(profileG, classesG, [])[0]!)).toBe('평일 점심 · 5끼 · 쓸 수 있는 메뉴 2개');
  });
});

describe('fixSuggestions', () => {
  it('가능하면 없다', () => {
    expect(fixSuggestions(profileG, classesG, [])).toEqual([]);
  });

  it('페르소나 F(화요일 점심 일정): 주 1회 메뉴 하나를 자주로 바꾸거나, 점심·저녁에 메뉴를 하나 더', () => {
    expect(fixSuggestions(profileF, classesF, [tueLunch])).toEqual([
      { kind: 'reclass', menu: '주먹밥', to: 'often' },
      { kind: 'reclass', menu: '토스트', to: 'often' },
      { kind: 'add_menu', meal: { dayType: 'weekday', meal: 'lunch' } },
      { kind: 'add_menu', meal: { dayType: 'weekday', meal: 'dinner' } },
    ]);
  });

  it('페르소나 F(일정 없음): 분류를 바꿔도 안 되어 평일 점심에 메뉴를 더하는 것만', () => {
    expect(fixSuggestions(profileF, classesF, [])).toEqual([{ kind: 'add_menu', meal: { dayType: 'weekday', meal: 'lunch' } }]);
  });

  it('피하기로 바꾼 메뉴를 자주로 되돌리면 되는 경우', () => {
    expect(fixSuggestions(profileG, [often('비빔밥'), avoid('칼국수')], [])).toEqual([
      { kind: 'reclass', menu: '칼국수', to: 'often' },
      { kind: 'add_menu', meal: { dayType: 'weekday', meal: 'lunch' } },
    ]);
  });
});
