// LLM이 만든 칸을 코드가 정리한다 (스펙 1.4, 4.3, tasks.md B17 T13-2·T13-3).
// 결과를 보장할 수 있는 것만 고친다: menuId 정규화, 외식 칸의 제목·주문 팁·이유(메뉴 분류 값, T13-1).
// 외식 칸 태그는 메뉴 분류 태그로 채운다(T13-4). 집밥 태그와 이유 같은 판단은 고치지 않는다 (checkPlan이 거르거나 프롬프트로 다룬다).
import { dayType, expandAvoid } from './helpers.ts';
import { cellTagsOf, USER_CHOSEN_REASON } from './menu-tags.ts';
import { normalizeMenuId } from './plan-prompt.ts';
import type { AvoidTag, MenuClassification, PlanCell, Profile } from './types.ts';

/**
 * - menuId: 괄호 설명을 떼고, 외식은 그 끼니 메뉴 목록의 글자로 맞춘다 (normalizeMenuId)
 * - 외식 title: 정규화한 menuId. 모델이 제목에 주문 팁을 괄호로 넣던 것을 막는다(B14 기록, 주문 팁 칸과 겹침)
 * - 외식 orderTip: 그 메뉴 분류의 주문 팁이 있으면 그것(모델 팁보다 우선, 다른 메뉴 팁을 옮겨 적는 실수 방지),
 *   없으면 모델이 쓴 팁. 모델은 제목에 팁을 쓴 칸에만 orderTip을 채우고 나머지는 비웠다(B14 기록)
 * - 외식 reason·criterionIds: 그 메뉴 분류의 이유·근거 기준 (T13-1). 사용자가 분류 화면에서 확인한 문장이다.
 *   생성 모델은 프롬프트로 막아도 "고추장을 적게 넣어 열량 조절", 외식 비빔밥 "현미밥으로" 같은 틀린 근거를 썼다(11-09 배포본 기록).
 *   주 1회 메뉴는 분류 이유가 제한 이유("튀김이라 …")라 앞에 WEEKLY_ONCE_NOTE를 붙인다.
 *   분류가 없거나 이유가 비었거나 사용자가 직접 정한 분류면 모델 이유 그대로, 근거 기준이 비었으면 모델 근거 그대로
 * - 외식 tags: 그 메뉴 분류에 tags가 있으면 그 값 (T13-4). 생성 모델은 같은 메뉴(샌드위치)에도 실행마다 다른 태그를 붙였다.
 *   사용자가 직접 정한 분류면 피할 음식 태그를 뺀다(그 재료 없이 주문한다고 봄, 그대로 두면 고를 때마다 avoid_tag).
 *   분류에 tags가 없으면(이 필드 전 분류) 모델 태그 그대로
 * - 집밥: menuId만 정규화한다
 * - 주재료(mainIngredient): 앞뒤 공백을 뗀다 (T18)
 */
export function finishCells(
  cells: readonly PlanCell[],
  profile: Profile,
  classes: readonly MenuClassification[],
): PlanCell[] {
  const tipsOf = new Map(classes.map((c) => [c.menu, c.orderTips]));
  const classOf = new Map(classes.map((c) => [c.menu, c]));
  const avoid = expandAvoid(profile.avoid);
  return cells.map((raw) => {
    // 주재료는 앞뒤 공백을 뗀다 (T18, 같은 주재료 규칙은 menuKey로 비교)
    const cell = raw.mainIngredient === undefined ? raw : { ...raw, mainIngredient: raw.mainIngredient.trim() };
    if (cell.place !== 'eat_out') return { ...cell, menuId: normalizeMenuId(cell.menuId) };
    const setting = profile.meals.find((m) => m.dayType === dayType(cell.day) && m.meal === cell.meal);
    const menuId = normalizeMenuId(cell.menuId, setting?.menus ?? []);
    const classTips = (tipsOf.get(menuId) ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
    const orderTip = classTips.length > 0 ? classTips.join(', ') : cell.orderTip?.trim() || undefined;
    const { orderTip: _dropped, ...rest } = cell;
    const c = classOf.get(menuId);
    return { ...rest, menuId, title: menuId, ...(orderTip ? { orderTip } : {}), ...classReason(c), ...classTags(c, avoid) };
  });
}

/** 외식 칸에 쓸 분류 태그 (T13-4). 분류에 태그가 없으면 빈 객체라 모델 태그가 남는다 */
function classTags(c: MenuClassification | undefined, avoid: readonly AvoidTag[]): Partial<Pick<PlanCell, 'tags'>> {
  const tags = cellTagsOf(c, avoid);
  return tags ? { tags } : {};
}

/** 주 1회 메뉴 이유 앞에 붙이는 말 (T13-1) */
export const WEEKLY_ONCE_NOTE = '이번 주 한 번만 넣었어요.';

/** 외식 칸에 쓸 분류의 이유·근거 기준. 쓸 수 없는 값은 빼서 모델 값이 남게 한다 */
function classReason(c: MenuClassification | undefined): Partial<Pick<PlanCell, 'reason' | 'criterionIds'>> {
  const reason = c?.reason.trim() ?? '';
  if (!c || reason === '' || reason === USER_CHOSEN_REASON) return {};
  return {
    reason: c.class === 'weekly_max_1' ? `${WEEKLY_ONCE_NOTE} ${reason}` : reason,
    ...(c.criterionIds.length > 0 ? { criterionIds: [...c.criterionIds] } : {}),
  };
}
