// LLM이 만든 칸을 코드가 정리한다 (스펙 1.4, 4.3, tasks.md B17 T13-2·T13-3).
// 결과를 보장할 수 있는 것만 고친다: menuId 정규화, 외식 칸의 제목과 주문 팁.
// 태그·이유 같은 판단은 고치지 않는다 (checkPlan이 거르거나 프롬프트로 다룬다).
import { dayType } from './helpers.ts';
import { normalizeMenuId } from './plan-prompt.ts';
import type { MenuClassification, PlanCell, Profile } from './types.ts';

/**
 * - menuId: 괄호 설명을 떼고, 외식은 그 끼니 메뉴 목록의 글자로 맞춘다 (normalizeMenuId)
 * - 외식 title: 정규화한 menuId. 모델이 제목에 주문 팁을 괄호로 넣던 것을 막는다(B14 기록, 주문 팁 칸과 겹침)
 * - 외식 orderTip: 그 메뉴 분류의 주문 팁이 있으면 그것(모델 팁보다 우선, 다른 메뉴 팁을 옮겨 적는 실수 방지),
 *   없으면 모델이 쓴 팁. 모델은 제목에 팁을 쓴 칸에만 orderTip을 채우고 나머지는 비웠다(B14 기록)
 * - 집밥: menuId만 정규화한다
 */
export function finishCells(
  cells: readonly PlanCell[],
  profile: Profile,
  classes: readonly MenuClassification[],
): PlanCell[] {
  const tipsOf = new Map(classes.map((c) => [c.menu, c.orderTips]));
  return cells.map((cell) => {
    if (cell.place !== 'eat_out') return { ...cell, menuId: normalizeMenuId(cell.menuId) };
    const setting = profile.meals.find((m) => m.dayType === dayType(cell.day) && m.meal === cell.meal);
    const menuId = normalizeMenuId(cell.menuId, setting?.menus ?? []);
    const classTips = (tipsOf.get(menuId) ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
    const orderTip = classTips.length > 0 ? classTips.join(', ') : cell.orderTip?.trim() || undefined;
    const { orderTip: _dropped, ...rest } = cell;
    return { ...rest, menuId, title: menuId, ...(orderTip ? { orderTip } : {}) };
  });
}
