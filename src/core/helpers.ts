import { AVOID_TAGS, DAYS, MEAL_TYPES } from './types.ts';
import type { AvoidTag, Day, DayType, Slot } from './types.ts';

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
