import { AVOID_TAGS, DAYS, MEAL_TYPES } from './types.ts';
import type { AvoidTag, Day, DayType, MealKey, Slot } from './types.ts';

export function dayType(day: Day): DayType {
  return day === 'sat' || day === 'sun' ? 'weekend' : 'weekday';
}

/** 요일(mon→sun) × 끼니(breakfast→dinner) 순서. 0~20 */
export function slotOrder(slot: Slot): number {
  return DAYS.indexOf(slot.day) * MEAL_TYPES.length + MEAL_TYPES.indexOf(slot.meal);
}

export function compareSlots(a: Slot, b: Slot): number {
  return slotOrder(a) - slotOrder(b);
}

export function sameSlot(a: Slot, b: Slot): boolean {
  return a.day === b.day && a.meal === b.meal;
}

export function toSlot(slot: Slot): Slot {
  return { day: slot.day, meal: slot.meal };
}

/** 같은 메뉴인지 판정할 때 쓰는 키. 공백을 모두 뺀다. */
export function menuKey(menuId: string): string {
  return menuId.replace(/\s+/g, '');
}

const MEAT_FAMILY: readonly AvoidTag[] = ['pork', 'beef', 'chicken'];

/** "meat"가 있으면 구체적인 고기 태그를 더한다. AvoidTag 선언 순서로 돌려준다. */
export function expandAvoid(avoid: readonly AvoidTag[]): AvoidTag[] {
  const set = new Set<AvoidTag>(avoid);
  if (set.has('meat')) for (const tag of MEAT_FAMILY) set.add(tag);
  return AVOID_TAGS.filter((tag) => set.has(tag));
}

/**
 * 다음 주 월요일(YYYY-MM-DD, 한국 시각 기준). 오늘이 월요일이어도 다음 주 월요일이다.
 * 기간 선택 화면(T5-3)이 생기기 전까지 식단표 기본 주로 쓴다.
 */
export function nextMondayKst(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const daysUntil = ((8 - kst.getUTCDay()) % 7) || 7; // getUTCDay: 일 0, 월 1
  kst.setUTCDate(kst.getUTCDate() + daysUntil);
  return kst.toISOString().slice(0, 10);
}

/** 프로필의 끼니 설정 6개 조합. 평일 아침 → 평일 점심 → … → 주말 저녁 순서 */
export const MEAL_KEYS: readonly MealKey[] = (['weekday', 'weekend'] as const).flatMap((dt) =>
  MEAL_TYPES.map((meal) => ({ dayType: dt, meal })),
);

export function sameMealKey(a: MealKey, b: MealKey): boolean {
  return a.dayType === b.dayType && a.meal === b.meal;
}

export function toMealKey(key: MealKey): MealKey {
  return { dayType: key.dayType, meal: key.meal };
}

/** MEAL_KEYS 안의 순서. 0~5 */
export function mealKeyOrder(key: MealKey): number {
  return MEAL_KEYS.findIndex((k) => sameMealKey(k, key));
}
