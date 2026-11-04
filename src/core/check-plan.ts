// 스펙 3장 규칙 점검. 순수 함수이고 LLM을 부르지 않는다.
// 프로필과 식단표가 스키마 검증을 통과했다고 가정한다.
import { compareSlots, dayType, expandAvoid, slotOrder, toSlot } from './helpers.ts';
import { DAYS, MEAL_TYPES, NUTRITION_TAGS, RULE_IDS } from './types.ts';
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

export function checkPlan(
  plan: Plan,
  profile: Profile,
  classes: readonly MenuClassification[],
  rules: CriteriaRules,
): CheckResult {
  const violations: Violation[] = [];
  const settingOf = (slot: Slot): MealSetting | undefined =>
    profile.meals.find((m) => m.dayType === dayType(slot.day) && m.meal === slot.meal);
  const isEvent = (slot: Slot) => plan.events.some((e) => e.day === slot.day && e.meal === slot.meal);

  // 3.1 채워야 할 끼니
  const required = new Set<number>();
  for (const day of DAYS) {
    for (const meal of MEAL_TYPES) {
      const slot = { day, meal };
      const setting = settingOf(slot);
      if (setting && setting.place !== 'skip' && !isEvent(slot)) required.add(slotOrder(slot));
    }
  }

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

  // consecutive_menu
  let consecutiveCount = 0;
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1]!;
    const cur = cells[i]!;
    if (prev.menuId === cur.menuId) {
      consecutiveCount++;
      violations.push({ rule: 'consecutive_menu', cells: [toSlot(prev), toSlot(cur)], regenerate: [toSlot(cur)] });
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
