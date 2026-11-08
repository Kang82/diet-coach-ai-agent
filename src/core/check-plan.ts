// 스펙 3장 규칙 점검. 순수 함수이고 LLM을 부르지 않는다.
// 프로필과 식단표가 스키마 검증을 통과했다고 가정한다.
import { compareSlots, dayType, expandAvoid, menuKey, slotOrder, toSlot } from './helpers.ts';
import { menuWeeklyMaxFor } from './plan-feasibility.ts';
import { mealSettingOf, requiredSlots } from './plan-slots.ts';
import { DAYS, MEAL_TYPES, NUTRITION_TAGS, RULE_IDS } from './types.ts';

// 다른 모듈이 check-plan에서 가져다 쓰던 이름 (plan-slots.ts로 옮김)
export { MENU_WEEKLY_MAX, requiredSlots } from './plan-slots.ts';
import type {
  AvoidTag,
  CheckResult,
  CheckStats,
  CriteriaRules,
  MealSetting,
  MenuClassification,
  NutritionTag,
  Plan,
  PlanCell,
  Profile,
  Slot,
  Violation,
} from './types.ts';


/** 같은 주재료 집밥 칸을 1주일에 넣을 수 있는 횟수 (T18, 사용자 결정 2026-11-08) */
export const MAIN_INGREDIENT_WEEKLY_MAX = 3;
export function checkPlan(
  plan: Plan,
  profile: Profile,
  classes: readonly MenuClassification[],
  rules: CriteriaRules,
): CheckResult {
  const violations: Violation[] = [];
  const settingOf = (slot: Slot): MealSetting | undefined => mealSettingOf(profile, slot);

  // 3.1 채워야 할 끼니
  const required = new Set(requiredSlots(profile, plan.events).map(slotOrder));

  // unexpected_cell: 채워야 할 끼니가 아닌 곳, 또는 같은 끼니의 두 번째 이후 칸
  const sorted = plan.cells
    .map((cell, index) => ({ cell, index }))
    .sort((a, b) => compareSlots(a.cell, b.cell) || a.index - b.index);
  const seen = new Set<number>();
  const cells: PlanCell[] = [];
  for (const { cell } of sorted) {
    const order = slotOrder(cell);
    if (!required.has(order) || seen.has(order)) {
      violations.push({ rule: 'unexpected_cell', cells: [toSlot(cell)], regenerate: [] });
      continue;
    }
    seen.add(order);
    cells.push(cell);
  }

  // missing_cell
  for (const order of [...required].sort((a, b) => a - b)) {
    if (!seen.has(order)) {
      const slot = slotFromOrder(order);
      violations.push({ rule: 'missing_cell', cells: [slot], regenerate: [slot] });
    }
  }

  // place_mismatch (T19-2): 칸의 외식·집밥이 끼니 설정과 다름. 외식 끼니에 집밥 칸을 넣으면 외식 규칙(메뉴 목록, 분류)을 모두 피해 갔다
  for (const cell of cells) {
    if (settingOf(cell)?.place !== cell.place) {
      violations.push({ rule: 'place_mismatch', cells: [toSlot(cell)], regenerate: [toSlot(cell)] });
    }
  }

  // avoid_tag
  const avoid = expandAvoid(profile.avoid);
  const avoidTagCounts: Partial<Record<AvoidTag, number>> = {};
  for (const tag of avoid) avoidTagCounts[tag] = 0;
  for (const cell of cells) {
    const hit = avoid.filter((tag) => cell.tags.includes(tag));
    for (const tag of hit) avoidTagCounts[tag] = (avoidTagCounts[tag] ?? 0) + 1;
    if (hit.length > 0) {
      violations.push({ rule: 'avoid_tag', cells: [toSlot(cell)], regenerate: [toSlot(cell)], detail: hit.join(',') });
    }
  }

  // eat_out_not_in_list
  const eatOut = cells.filter((c) => c.place === 'eat_out');
  for (const cell of eatOut) {
    const menus = settingOf(cell)?.menus ?? [];
    if (!menus.includes(cell.menuId)) {
      violations.push({ rule: 'eat_out_not_in_list', cells: [toSlot(cell)], regenerate: [toSlot(cell)] });
    }
  }

  // class_avoid, class_weekly_limit (외식 칸만, 분류에 없는 메뉴는 무시)
  const classOf = new Map(classes.map((c) => [c.menu, c.class]));
  for (const cell of eatOut) {
    if (classOf.get(cell.menuId) === 'avoid') {
      violations.push({ rule: 'class_avoid', cells: [toSlot(cell)], regenerate: [toSlot(cell)] });
    }
  }
  const limitedMenuCounts: Record<string, number> = {};
  const limitedMenuCells = new Map<string, PlanCell[]>();
  for (const cell of eatOut) {
    if (classOf.get(cell.menuId) !== 'weekly_max_1') continue;
    const list = limitedMenuCells.get(cell.menuId) ?? [];
    list.push(cell);
    limitedMenuCells.set(cell.menuId, list);
    limitedMenuCounts[cell.menuId] = list.length;
  }
  for (const [menu, list] of limitedMenuCells) {
    if (list.length > 1) {
      violations.push({
        rule: 'class_weekly_limit',
        cells: list.map(toSlot),
        regenerate: list.slice(1).map(toSlot),
        detail: menu,
      });
    }
  }

  // tag_weekly_limit
  const limitedTagCounts: Partial<Record<NutritionTag, number>> = {};
  for (const tag of NUTRITION_TAGS) {
    const max = rules.tagLimits[tag];
    if (max === undefined) continue;
    const hit = cells.filter((c) => c.tags.includes(tag));
    limitedTagCounts[tag] = hit.length;
    if (hit.length > max) {
      violations.push({
        rule: 'tag_weekly_limit',
        cells: hit.map(toSlot),
        regenerate: hit.slice(max).map(toSlot),
        detail: tag,
      });
    }
  }

  // consecutive_menu: 시간순으로 바로 이어진 두 칸
  let consecutiveCount = 0;
  const adjacentPairs = new Set<string>();
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1]!;
    const cur = cells[i]!;
    adjacentPairs.add(pairKey(prev, cur));
    if (menuKey(prev.menuId) === menuKey(cur.menuId)) {
      consecutiveCount++;
      violations.push({ rule: 'consecutive_menu', cells: [toSlot(prev), toSlot(cur)], regenerate: [toSlot(cur)] });
    }
  }

  // same_meal_consecutive_days: 같은 끼니, 달력상 연속된 요일. 이미 이어진 칸으로 보고한 쌍은 건너뛴다.
  const cellAt = new Map(cells.map((c) => [slotOrder(c), c]));
  for (const meal of MEAL_TYPES) {
    for (let d = 1; d < DAYS.length; d++) {
      const prev = cellAt.get(slotOrder({ day: DAYS[d - 1]!, meal }));
      const cur = cellAt.get(slotOrder({ day: DAYS[d]!, meal }));
      if (!prev || !cur || adjacentPairs.has(pairKey(prev, cur))) continue;
      if (menuKey(prev.menuId) === menuKey(cur.menuId)) {
        consecutiveCount++;
        violations.push({
          rule: 'same_meal_consecutive_days',
          cells: [toSlot(prev), toSlot(cur)],
          regenerate: [toSlot(cur)],
        });
      }
    }
  }

  // menu_weekly_limit: 같은 메뉴 주 2회 초과. 외식 칸의 주 1회 이하·피하기로 분류된 메뉴는 더 엄격한 규칙(class_*)이 맡는다.
  // class_*는 외식 칸만 보므로 집밥 칸은 분류와 관계없이 여기서 센다 (T19-3).
  // 외식 메뉴가 적으면 사전 점검이 정한 횟수까지 허용한다 (B15, plan-feasibility.ts). 프로필·분류·일정으로 결정돼 어디서 점검해도 같다
  const weeklyMax = menuWeeklyMaxFor(profile, classes, plan.events);
  const strictKeys = new Set(classes.filter((c) => c.class !== 'often').map((c) => menuKey(c.menu)));
  const byMenu = new Map<string, PlanCell[]>();
  for (const cell of cells) {
    const key = menuKey(cell.menuId);
    if (cell.place === 'eat_out' && strictKeys.has(key)) continue;
    const list = byMenu.get(key) ?? [];
    list.push(cell);
    byMenu.set(key, list);
  }
  for (const list of byMenu.values()) {
    if (list.length > weeklyMax) {
      violations.push({
        rule: 'menu_weekly_limit',
        cells: list.map(toSlot),
        regenerate: list.slice(weeklyMax).map(toSlot),
        detail: list[0]!.menuId,
      });
    }
  }

  // 같은 주재료 (T18): 집밥 칸 중 mainIngredient가 있는 칸만. 외식은 메뉴 규칙이 맡는다
  const mainKey = (cell: PlanCell) => (cell.place === 'home' && cell.mainIngredient ? menuKey(cell.mainIngredient) : '');
  // main_ingredient_consecutive: 시간순으로 바로 이어진 두 집밥 칸. 같은 메뉴라 consecutive_menu로 보고한 쌍은 건너뛴다
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1]!;
    const cur = cells[i]!;
    const key = mainKey(cur);
    if (!key || key !== mainKey(prev) || menuKey(prev.menuId) === menuKey(cur.menuId)) continue;
    violations.push({
      rule: 'main_ingredient_consecutive',
      cells: [toSlot(prev), toSlot(cur)],
      regenerate: [toSlot(cur)],
      detail: prev.mainIngredient!.trim(),
    });
  }
  // main_ingredient_weekly_limit: 같은 주재료 집밥 주 MAIN_INGREDIENT_WEEKLY_MAX회 초과
  const byMain = new Map<string, PlanCell[]>();
  for (const cell of cells) {
    const key = mainKey(cell);
    if (!key) continue;
    byMain.set(key, [...(byMain.get(key) ?? []), cell]);
  }
  for (const list of byMain.values()) {
    if (list.length > MAIN_INGREDIENT_WEEKLY_MAX) {
      violations.push({
        rule: 'main_ingredient_weekly_limit',
        cells: list.map(toSlot),
        regenerate: list.slice(MAIN_INGREDIENT_WEEKLY_MAX).map(toSlot),
        detail: list[0]!.mainIngredient!.trim(),
      });
    }
  }

  // cook_time_exceeded (설정에 값이 없으면 점검하지 않음)
  for (const cell of cells) {
    if (cell.place !== 'home') continue;
    const limit = settingOf(cell)?.cookMinutes;
    if (limit !== undefined && cell.cookMinutes > limit) {
      violations.push({ rule: 'cook_time_exceeded', cells: [toSlot(cell)], regenerate: [toSlot(cell)] });
    }
  }

  // reason_criterion
  for (const cell of cells) {
    if (cell.criterionIds.length === 0 || cell.criterionIds.some((c) => !rules.criteria.includes(c))) {
      violations.push({ rule: 'reason_criterion', cells: [toSlot(cell)], regenerate: [toSlot(cell)] });
    }
  }

  const stats: CheckStats = { avoidTagCounts, limitedMenuCounts, limitedTagCounts, consecutiveCount };
  return { passed: violations.length === 0, violations: sortViolations(violations), stats };
}

function pairKey(a: Slot, b: Slot): string {
  return `${slotOrder(a)}-${slotOrder(b)}`;
}

function slotFromOrder(order: number): Slot {
  return { day: DAYS[Math.floor(order / MEAL_TYPES.length)]!, meal: MEAL_TYPES[order % MEAL_TYPES.length]! };
}

// 3.3 정렬: 규칙 선언 순서 → cells[0] 시간순 → detail 사전순
function sortViolations(violations: Violation[]): Violation[] {
  return [...violations].sort(
    (a, b) =>
      RULE_IDS.indexOf(a.rule) - RULE_IDS.indexOf(b.rule) ||
      compareSlots(a.cells[0]!, b.cells[0]!) ||
      (a.detail ?? '').localeCompare(b.detail ?? ''),
  );
}
