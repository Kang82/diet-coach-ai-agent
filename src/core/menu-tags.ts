// 메뉴 분류 태그 도우미 (T13-4). menu-classification.ts와 plan-prompt.ts가 함께 쓴다(둘이 서로 부르지 않게 따로 둔다).
import { AVOID_TAGS, NUTRITION_TAGS, type AvoidTag, type MenuClassification, type Tag } from './types.ts';

/** 사용자가 분류를 바꾼 메뉴의 이유. LLM이 쓴 이유는 바뀐 분류와 어긋날 수 있어 바꾼다 */
export const USER_CHOSEN_REASON = '직접 정한 분류';

const TAG_ORDER: readonly Tag[] = [...AVOID_TAGS, ...NUTRITION_TAGS];

/** 태그를 선언 순서(재료 → 음식 종류)로, 중복 없이 */
export function sortTags(tags: readonly Tag[]): Tag[] {
  return TAG_ORDER.filter((t) => tags.includes(t));
}

/**
 * 외식 칸에 들어갈 이 메뉴의 태그. 분류에 태그가 없으면(이 필드 전 분류) undefined라 모델 태그를 쓴다.
 * 사용자가 직접 정한 분류면 피할 음식 태그를 뺀다(그 재료 없이 주문한다고 봄). avoid는 expandAvoid를 거친 값
 */
export function cellTagsOf(c: MenuClassification | undefined, avoid: readonly AvoidTag[]): Tag[] | undefined {
  if (!c?.tags) return undefined;
  if (c.reason.trim() !== USER_CHOSEN_REASON) return [...c.tags];
  return c.tags.filter((t) => !avoid.includes(t as AvoidTag));
}
