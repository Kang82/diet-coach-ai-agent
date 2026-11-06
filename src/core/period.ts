// 기간 선택 (스펙 7장, tasks.md B6 T5-3). 첫 시연은 "다음 주 월~일" 한 가지이고, 정해진 일정(회식, 약속)만 받는다.
// 일정이 있는 끼니에는 식단표 칸을 두지 않는다 (스펙 1.4, check-plan.ts의 requiredSlots).
import { dayType, slotOrder } from './helpers.ts';
import { DAYS, MEAL_TYPES } from './types.ts';
import type { MealSetting, PlanEvent, Slot } from './types.ts';

export const EVENT_NOTE_MAX = 50;

export interface PlanPeriod {
  /** 월요일 (YYYY-MM-DD). 기간을 정한 시점에 고정한다 */
  weekStart: string;
  events: PlanEvent[];
}

export interface EventIssue {
  code: 'not_meal' | 'duplicate' | 'empty_note' | 'too_long';
  slot: Slot;
}

/** 일정을 넣을 수 있는 칸: 안 먹는 끼니가 아닌 칸, 시간순 */
export function eventSlotOptions(meals: readonly MealSetting[]): Slot[] {
  const slots: Slot[] = [];
  for (const day of DAYS) {
    for (const meal of MEAL_TYPES) {
      const setting = meals.find((m) => m.dayType === dayType(day) && m.meal === meal);
      if (setting && setting.place !== 'skip') slots.push({ day, meal });
    }
  }
  return slots;
}

/** 메모를 정리하고 시간순으로 정렬한다. 문제가 있으면 issues (일정은 빼지 않는다) */
export function validateEvents(
  meals: readonly MealSetting[],
  events: readonly PlanEvent[],
): { events: PlanEvent[]; issues: EventIssue[] } {
  const options = eventSlotOptions(meals);
  const issues: EventIssue[] = [];
  const cleaned: PlanEvent[] = [];
  for (const e of events) {
    const slot = { day: e.day, meal: e.meal };
    const note = e.note.trim().replace(/\s+/g, ' ');
    if (!options.some((o) => o.day === slot.day && o.meal === slot.meal)) issues.push({ code: 'not_meal', slot });
    else if (cleaned.some((c) => c.day === slot.day && c.meal === slot.meal)) issues.push({ code: 'duplicate', slot });
    else if (note === '') issues.push({ code: 'empty_note', slot });
    else if ([...note].length > EVENT_NOTE_MAX) issues.push({ code: 'too_long', slot });
    cleaned.push({ ...slot, note });
  }
  return { events: cleaned.sort((a, b) => slotOrder(a) - slotOrder(b)), issues };
}
