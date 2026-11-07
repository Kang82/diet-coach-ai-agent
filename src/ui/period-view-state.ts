// 기간 선택 화면(PeriodView)의 상태 판단 (tasks.md T9-6). 화면은 이 값대로 그린다.
// 모든 끼니에 일정을 넣으면 고를 끼니가 없어 폼이 안내 없이 사라졌고, 식단표로 짤 칸이 0개인데도 다음으로 갈 수 있었다.
import { eventSlotOptions, validateEvents } from '../core/period.ts';
import type { MealSetting, PlanEvent, Slot } from '../core/types.ts';

export const ALL_TAKEN_MESSAGE = '모든 끼니에 일정을 넣었어요. 일정을 빼면 다시 넣을 수 있어요.';
export const NO_MEALS_LEFT_MESSAGE = '식단표로 짤 끼니가 하나는 남아야 해요. 일정 하나를 빼 주세요.';
const CHECK_EVENTS_MESSAGE = '일정을 다시 확인해 주세요.';

export interface PeriodFormState {
  /** 아직 일정을 넣지 않은 끼니, 시간순 */
  options: Slot[];
  /** 넣을 끼니가 남지 않음. 폼 대신 ALL_TAKEN_MESSAGE를 보인다 */
  full: boolean;
  canNext: boolean;
  /** 다음을 막은 이유 */
  alert: string | undefined;
}

export function periodFormState(meals: readonly MealSetting[], events: readonly PlanEvent[]): PeriodFormState {
  const taken = (s: Slot) => events.some((e) => e.day === s.day && e.meal === s.meal);
  const options = eventSlotOptions(meals).filter((s) => !taken(s));
  const { issues } = validateEvents(meals, events);
  const alert =
    issues.length === 0 ? undefined : issues.some((i) => i.code === 'no_meals_left') ? NO_MEALS_LEFT_MESSAGE : CHECK_EVENTS_MESSAGE;
  return { options, full: options.length === 0, canNext: issues.length === 0, alert };
}
