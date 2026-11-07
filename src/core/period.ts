// 기간 선택 (스펙 7장, tasks.md B6 T5-3). 첫 시연은 "다음 주 월~일" 한 가지이고, 정해진 일정(회식, 약속)만 받는다.
// 일정이 있는 끼니에는 식단표 칸을 두지 않는다 (스펙 1.4, check-plan.ts의 requiredSlots).
import { dayType, nextMondayKst, slotOrder } from './helpers.ts';
import { DAYS, MEAL_TYPES } from './types.ts';
import type { MealSetting, PlanEvent, Slot } from './types.ts';

export const EVENT_NOTE_MAX = 50;

export interface PlanPeriod {
  /** 월요일 (YYYY-MM-DD). 기간을 정한 시점(분류)에 정한다. 만들 때 이미 시작한 주면 planWeekStart가 다시 정한다 (T9-4) */
  weekStart: string;
  events: PlanEvent[];
}

export type EventIssue =
  | { code: 'not_meal' | 'duplicate' | 'empty_note' | 'too_long'; slot: Slot }
  /** 모든 끼니가 일정이라 식단표로 짤 끼니가 없다 (T9-6) */
  | { code: 'no_meals_left' };

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
  if (options.length > 0 && options.every((o) => cleaned.some((c) => c.day === o.day && c.meal === o.meal))) {
    issues.push({ code: 'no_meals_left' });
  }
  return { events: cleaned.sort((a, b) => slotOrder(a) - slotOrder(b)), issues };
}

/**
 * 식단표 시작일 (T9-4). 저장한 시작일(분류할 때 정함)이 아직 오지 않았으면 그대로, 오늘(KST)이거나 지났으면 다음 월요일.
 * 일정은 요일 기준이라 주가 바뀌어도 의미가 같다. 일요일 밤에 분류하고 월요일에 만들면 이미 시작한 주가 되던 문제를 막는다
 */
export function planWeekStart(saved: string | undefined, now: Date): string {
  const todayKst = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return saved && saved > todayKst ? saved : nextMondayKst(now);
}
