// 분류 확인 화면의 메뉴별 태그 한 줄 (tasks.md T13-4, 읽기 전용).
// 외식 칸 태그는 이 값으로 채워진다(core/plan-cells.ts). 왜 피하기·주 1회인지 사용자가 볼 수 있게 한다.
import { AVOID_TAG_LABELS, NUTRITION_TAG_LABELS } from '../core/labels.ts';
import { AVOID_TAG_REASON_PREFIX, AVOID_TAG_REASON_SUFFIX } from '../core/menu-classification.ts';
import { AVOID_TAGS, NUTRITION_TAGS, type MenuClass, type MenuClassification } from '../core/types.ts';

/** "들어가는 것: 밀, 닭고기 · 흰 면·흰 빵이 주식인 메뉴". 태그가 없으면 undefined(줄을 숨김) */
export function tagLine(c: MenuClassification): string | undefined {
  const tags = c.tags ?? [];
  const ingredients = AVOID_TAGS.filter((t) => tags.includes(t)).map((t) => AVOID_TAG_LABELS[t]);
  const kinds = NUTRITION_TAGS.filter((t) => tags.includes(t)).map((t) => NUTRITION_TAG_LABELS[t]);
  const parts = [...(ingredients.length > 0 ? [`들어가는 것: ${ingredients.join(', ')}`] : []), ...kinds];
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * 피할 음식 태그 때문에 코드가 피하기로 바꾼 메뉴(core/menu-classification.ts)를 사용자가 다른 분류로 고르면,
 * 식단표에서는 그 재료 태그를 뺀다(core/menu-tags.ts의 cellTagsOf). 그 뜻을 알린다
 */
export function avoidTagNote(c: MenuClassification, chosen: MenuClass): string | undefined {
  if (chosen === 'avoid' || c.class !== 'avoid') return undefined;
  if (!c.reason.startsWith(AVOID_TAG_REASON_PREFIX) || !c.reason.endsWith(AVOID_TAG_REASON_SUFFIX)) return undefined;
  const names = c.reason.slice(AVOID_TAG_REASON_PREFIX.length, -AVOID_TAG_REASON_SUFFIX.length);
  return `${names} 없이 주문한다고 보고 식단을 짜요.`;
}
