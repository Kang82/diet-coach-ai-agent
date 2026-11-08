// 사전 점검: 외식 메뉴로 규칙을 지키는 1주일 배치가 있는지 (tasks.md B15 T11-1, 스펙 3.2·4.3).
// 배포본 사용자 프로필은 외식 메뉴가 적어 규칙(같은 메뉴 주 2번, 주 1회 메뉴 1번, 바로 앞 끼니·같은 끼니 전날 같은 메뉴 금지)을
// 모두 지키는 식단표가 없었다. 모델은 불가능한 조건을 맞추려 5~6분을 쓰고 실패했다.
// 사용자 결정(2026-11-08): 메뉴가 적으면 같은 메뉴 허용 횟수를 늘린다. 연속 금지와 주 1회 메뉴 제한은 풀지 않는다.
// 그래도 불가능하면 메뉴 하나를 더 넣으면 가능해지는 끼니를 알려 LLM을 부르기 전에 막는다.
//
// 외식 칸만 메뉴가 정해져 있다. 집밥 칸은 메뉴가 자유라 항상 앞뒤와 다른 메뉴를 고를 수 있다고 본다.
// 판정은 checkPlan과 같다: 메뉴 비교는 menuKey(공백 제거), 분류는 메뉴 이름 그대로, 분류에 없는 메뉴는 자주(often).
import { MENU_WEEKLY_MAX, requiredSlots } from './plan-slots.ts';
import { dayType, MEAL_KEYS, menuKey, sameMealKey, slotOrder } from './helpers.ts';
import { DAY_TYPE_LABELS, MEAL_LABELS } from './labels.ts';
import { DAYS, type MealKey, type MenuClass, type MenuClassification, type Profile, type Slot } from './types.ts';

export type Feasibility = { feasible: true; menuWeeklyMax: number } | { feasible: false; shortMeals: MealKey[] };

/** 같은 메뉴 허용 횟수를 이 값까지 올려 본다. 한 끼니는 1주일에 최대 7칸이다 */
const MAX_WEEKLY = DAYS.length;

/** 모자란 끼니를 찾을 때 더해 보는 가짜 메뉴. 실제 메뉴 이름과 겹치지 않는다 */
const EXTRA_MENU = '\u0000extra';

export function planFeasibility(profile: Profile, classes: readonly MenuClassification[], events: readonly Slot[]): Feasibility {
  for (let k = MENU_WEEKLY_MAX; k <= MAX_WEEKLY; k++) {
    // 노드 상한에 걸려 모르면(unknown) 가능으로 본다. 사용자를 잘못 막지 않고, 모델이 시도한 결과를 checkPlan이 거른다 (T19-1)
    if (findEatOutAssignment(profile, classes, events, k) !== undefined) return { feasible: true, menuWeeklyMax: k };
  }
  const eatOutMeals = MEAL_KEYS.filter((key) => {
    const setting = profile.meals.find((m) => sameMealKey(m, key));
    return setting?.place === 'eat_out' && requiredSlots(profile, events).some((s) => sameMealKey({ dayType: dayType(s.day), meal: s.meal }, key));
  });
  const shortMeals = eatOutMeals.filter((key) => {
    const withExtra: Profile = {
      ...profile,
      meals: profile.meals.map((m) => (sameMealKey(m, key) ? { ...m, menus: [...(m.menus ?? []), EXTRA_MENU] } : m)),
    };
    return findEatOutAssignment(withExtra, classes, events, MAX_WEEKLY) !== undefined;
  });
  return { feasible: false, shortMeals: (shortMeals.length > 0 ? shortMeals : eatOutMeals).map((k) => ({ dayType: k.dayType, meal: k.meal })) };
}

/** 사전 점검에서 정한 같은 메뉴 허용 횟수. 불가능하면 기본값(checkPlan·프롬프트가 같은 값을 쓴다) */
export function menuWeeklyMaxFor(profile: Profile, classes: readonly MenuClassification[], events: readonly Slot[]): number {
  const result = planFeasibility(profile, classes, events);
  return result.feasible ? result.menuWeeklyMax : MENU_WEEKLY_MAX;
}

/**
 * 탐색 노드(메뉴를 칸에 놓아 보는 횟수) 상한. 넘으면 판정을 포기하고 'unknown'.
 * 가장 좁은 칸 먼저 + 앞질러 점검으로 보통 수백 노드 안에 끝난다 (T19-1). 화면 렌더와 도구가 멈추지 않게 하는 안전장치다
 */
export const SEARCH_NODE_LIMIT = 200_000;

/**
 * 같은 메뉴 허용 횟수가 weeklyMax일 때 규칙을 지키는 배치 하나. 채워야 할 끼니를 시간순으로, 외식 칸은 메뉴 이름, 집밥 칸은 undefined.
 * 없으면 undefined, 노드 상한을 넘으면 'unknown'.
 *
 * 2차 코드 리뷰(T19-1): 시간순 백트래킹은 뒤쪽(주말) 끼니가 불가능하면 앞쪽 평일 메뉴 조합을 다 돌아 지수 시간이 걸렸다
 * (평일 세 끼 메뉴 4개씩이면 60초 이상). 그래서 후보가 가장 적은 외식 칸부터 놓고(MRV), 놓을 때마다 이웃 칸
 * (시간순 바로 앞뒤, 같은 끼니 전날·다음날)과 횟수를 다 쓴 메뉴를 다른 칸 후보에서 미리 지워 막다른 길을 바로 되돌린다.
 * 집밥 칸은 메뉴가 자유라 제약이 없어 탐색에서 뺀다
 */
export function findEatOutAssignment(
  profile: Profile,
  classes: readonly MenuClassification[],
  events: readonly Slot[],
  weeklyMax: number,
  nodeLimit = SEARCH_NODE_LIMIT,
): [Slot, string | undefined][] | undefined | 'unknown' {
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
  // 메뉴(menuKey)별 허용 횟수: 주 1회로 분류된 이름이 하나라도 있으면 1
  const limitOf = new Map<string, number>();
  for (const list of candidatesOf) {
    for (const menu of list ?? []) {
      const key = menuKey(menu);
      const limit = classOf.get(menu) === 'weekly_max_1' ? 1 : weeklyMax;
      limitOf.set(key, Math.min(limitOf.get(key) ?? limit, limit));
    }
  }

  // 외식 칸만 변수다. 칸마다 남은 후보(메뉴 키)와 키 → 그 끼니 목록의 메뉴 이름
  const eatOut = slots.flatMap((_, i) => (candidatesOf[i] === undefined ? [] : [i]));
  const menuOf = new Map<number, Map<string, string>>();
  const domain = new Map<number, Set<string>>();
  for (const i of eatOut) {
    const names = new Map(candidatesOf[i]!.map((menu) => [menuKey(menu), menu]));
    menuOf.set(i, names);
    domain.set(i, new Set(names.keys()));
  }
  // 이웃: 시간순 바로 앞뒤 칸(consecutive_menu), 같은 끼니 전날·다음날 칸(same_meal_consecutive_days). 둘 다 외식일 때만 제약
  const indexAt = new Map(slots.map((slot, i) => [slotOrder(slot), i]));
  const neighbors = new Map<number, number[]>();
  for (const i of eatOut) {
    const slot = slots[i]!;
    const d = DAYS.indexOf(slot.day);
    const around = [
      i - 1,
      i + 1,
      d > 0 ? indexAt.get(slotOrder({ day: DAYS[d - 1]!, meal: slot.meal })) : undefined,
      d < DAYS.length - 1 ? indexAt.get(slotOrder({ day: DAYS[d + 1]!, meal: slot.meal })) : undefined,
    ];
    neighbors.set(i, [...new Set(around.filter((j): j is number => j !== undefined && domain.has(j)))]);
  }

  const chosen = new Map<number, string>(); // 칸 → 메뉴 키
  const used = new Map<string, number>();
  let nodes = 0;
  let gaveUp = false;

  const search = (): boolean => {
    // 후보가 가장 적은 칸 (같으면 앞 칸)
    let next: number | undefined;
    for (const i of eatOut) {
      if (chosen.has(i)) continue;
      if (next === undefined || domain.get(i)!.size < domain.get(next)!.size) next = i;
    }
    if (next === undefined) return true;
    // 덜 쓴 메뉴부터 시도하면 빨리 찾는다
    const ordered = [...domain.get(next)!].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0));
    for (const key of ordered) {
      if (++nodes > nodeLimit) {
        gaveUp = true;
        return false;
      }
      const count = (used.get(key) ?? 0) + 1;
      used.set(key, count);
      chosen.set(next, key);
      // 앞질러 점검: 이웃 칸과(횟수를 다 썼으면) 모든 칸의 후보에서 이 메뉴를 지운다. 후보가 바닥난 칸이 있으면 막다른 길
      const removed: number[] = [];
      const exhausted = count >= (limitOf.get(key) ?? weeklyMax);
      let deadEnd = false;
      for (const j of exhausted ? eatOut : neighbors.get(next)!) {
        if (chosen.has(j)) continue;
        const options = domain.get(j)!;
        if (!options.delete(key)) continue;
        removed.push(j);
        if (options.size === 0) deadEnd = true;
      }
      if (!deadEnd && search()) return true;
      for (const j of removed) domain.get(j)!.add(key);
      chosen.delete(next);
      used.set(key, count - 1);
      if (gaveUp) return false;
    }
    return false;
  };

  const found = eatOut.every((i) => domain.get(i)!.size > 0) && search();
  if (gaveUp) return 'unknown';
  if (!found) return undefined;
  return slots.map((slot, i) => {
    const key = chosen.get(i);
    return [{ day: slot.day, meal: slot.meal }, key === undefined ? undefined : menuOf.get(i)!.get(key)];
  });
}

const mealLabel = (key: MealKey) => `${DAY_TYPE_LABELS[key.dayType]} ${MEAL_LABELS[key.meal]}`;

/** 불가능할 때 안내 문구. 끼니 이름(아침·점심·저녁)은 모두 받침으로 끝나 조사는 "이나" */
export function shortMealsMessage(shortMeals: readonly MealKey[]): string {
  const names = shortMeals.map(mealLabel);
  return `${names.join(', ')} 외식 메뉴가 적어 규칙에 맞는 식단표를 만들 수 없어요. ${names.join('이나 ')}에 외식 메뉴를 더 넣어 주세요.`;
}

/** 메뉴 분류 확인 화면 (B15 T11-4): 바꾼 분류와 기간 화면의 일정으로 불가능하면 만들기를 막는 문구. 가능하면 undefined */
export function classStepWarning(profile: Profile, classes: readonly MenuClassification[], events: readonly Slot[]): string | undefined {
  const result = planFeasibility(profile, classes, events);
  return result.feasible ? undefined : shortMealsMessage(result.shortMeals);
}

/**
 * 프로필 확인 화면 (B15 T11-4): 분류 전이라 모든 메뉴를 자주(often), 일정 없음으로 본다. 그래도 불가능하면 메뉴를 더 넣으라는 안내.
 * 안내만 하고 막지는 않는다(분류와 일정은 다음 단계에서 정해진다)
 */
export function profileStepHint(profile: Profile): string | undefined {
  const result = planFeasibility(profile, [], []);
  if (result.feasible) return undefined;
  const names = result.shortMeals.map(mealLabel);
  return `${names.join(', ')} 외식 메뉴가 적어 식단표를 만들기 어려워요. 같은 메뉴는 바로 앞 끼니나 전날 같은 끼니에 다시 넣지 않아서, ${names.join('이나 ')}에 메뉴를 더 넣어 주세요.`;
}

/** 분류 확인 화면의 끼니 묶음 (B16 T12-1). 외식 끼니마다 칸 수와 쓸 수 있는 메뉴 수 */
export interface MealGroup {
  meal: MealKey;
  /** 일정을 뺀 칸 수 */
  slots: number;
  /** 그 끼니의 메뉴(공백 정리, 중복 없이, 입력 순서). 분류 목록의 이름과 같다 */
  menus: string[];
  /** 피하기가 아닌 메뉴 수 */
  usable: number;
  /** 그중 주 1회 메뉴 수 */
  weekly1: number;
  /** 메뉴가 모자란 끼니 (사전 점검의 shortMeals) */
  short: boolean;
}

export function mealGroups(profile: Profile, classes: readonly MenuClassification[], events: readonly Slot[]): MealGroup[] {
  const result = planFeasibility(profile, classes, events);
  const shortMeals = result.feasible ? [] : result.shortMeals;
  const classOf = (menu: string): MenuClass => classes.find((c) => c.menu === menu)?.class ?? 'often';
  const slots = requiredSlots(profile, events);
  const groups: MealGroup[] = [];
  for (const key of MEAL_KEYS) {
    const setting = profile.meals.find((m) => sameMealKey(m, key));
    if (setting?.place !== 'eat_out') continue;
    const menus: string[] = [];
    for (const raw of setting.menus ?? []) {
      const menu = raw.trim();
      if (menu !== '' && !menus.includes(menu)) menus.push(menu);
    }
    const usable = menus.filter((m) => classOf(m) !== 'avoid');
    groups.push({
      meal: { dayType: key.dayType, meal: key.meal },
      slots: slots.filter((s) => sameMealKey({ dayType: dayType(s.day), meal: s.meal }, key)).length,
      menus,
      usable: usable.length,
      weekly1: usable.filter((m) => classOf(m) === 'weekly_max_1').length,
      short: shortMeals.some((s) => sameMealKey(s, key)),
    });
  }
  return groups;
}

/** 불가능할 때 해결 방법 (B16 T12-1). 분류를 자주로 바꾸면 되는 메뉴, 메뉴를 하나 더 넣으면 되는 끼니 */
export type FixSuggestion = { kind: 'reclass'; menu: string; to: 'often' } | { kind: 'add_menu'; meal: MealKey };

export function fixSuggestions(profile: Profile, classes: readonly MenuClassification[], events: readonly Slot[]): FixSuggestion[] {
  const result = planFeasibility(profile, classes, events);
  if (result.feasible) return [];
  const candidates: string[] = [];
  for (const group of mealGroups(profile, classes, events)) {
    if (!group.short) continue;
    for (const menu of group.menus) {
      const c = classes.find((x) => x.menu === menu)?.class;
      if ((c === 'weekly_max_1' || c === 'avoid') && !candidates.includes(menu)) candidates.push(menu);
    }
  }
  const reclass: FixSuggestion[] = candidates
    .filter((menu) => planFeasibility(profile, classes.map((c) => (c.menu === menu ? { ...c, class: 'often' as const } : c)), events).feasible)
    .map((menu) => ({ kind: 'reclass', menu, to: 'often' }));
  return [...reclass, ...result.shortMeals.map((meal): FixSuggestion => ({ kind: 'add_menu', meal }))];
}

/** 묶음 머리 문구: "평일 저녁 · 5끼 · 쓸 수 있는 메뉴 3개(주 1회 1개)" */
export function mealGroupLabel(group: MealGroup): string {
  const weekly = group.weekly1 > 0 ? `(주 1회 ${group.weekly1}개)` : '';
  return `${mealLabel(group.meal)} · ${group.slots}끼 · 쓸 수 있는 메뉴 ${group.usable}개${weekly}`;
}

export { mealLabel };
