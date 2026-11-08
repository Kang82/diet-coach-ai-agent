// 채워야 할 끼니와 같은 메뉴 기본 허용 횟수 (스펙 3.1, 3.2). check-plan.ts와 plan-feasibility.ts가 함께 쓴다(서로 import하지 않게 따로 둔다).
import { dayType } from './helpers.ts';
import { DAYS, MEAL_TYPES } from './types.ts';
import type { MealSetting, Profile, Slot } from './types.ts';

/** 같은 메뉴는 주 2회까지가 기본이다. 외식 메뉴가 적으면 사전 점검이 늘린다 (스펙 3.2, plan-feasibility.ts) */
export const MENU_WEEKLY_MAX = 2;

export function mealSettingOf(profile: Profile, slot: Slot): MealSetting | undefined {
  return profile.meals.find((m) => m.dayType === dayType(slot.day) && m.meal === slot.meal);
}

/** 3.1 채워야 할 끼니: skip이 아니고 일정(회식, 약속)이 없는 끼니. 시간순. */
export function requiredSlots(profile: Profile, events: readonly Slot[]): Slot[] {
  const slots: Slot[] = [];
  for (const day of DAYS) {
    for (const meal of MEAL_TYPES) {
      const slot = { day, meal };
      const setting = mealSettingOf(profile, slot);
      const isEvent = events.some((e) => e.day === day && e.meal === meal);
      if (setting && setting.place !== 'skip' && !isEvent) slots.push(slot);
    }
  }
  return slots;
}
