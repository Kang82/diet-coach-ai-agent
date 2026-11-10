// 식단표 칸 "먹었어요" 체크 (tasks.md T25, Task2 R2, 스펙 5장). 칸 위치와 시각만 남기고 메뉴 이름은 남기지 않는다.
// 라우트는 server/check-routes.ts, 화면 상태는 ui/plan-checks.ts.
import { DAYS, MEAL_TYPES, type Day, type MealType, type Slot } from './types.ts';

/** 사용자 하나가 하루(UTC)에 할 수 있는 체크·해제 수. 칸 14개를 여러 번 바꿔도 넉넉하고, D1 쓰기를 묶는다 (docs/plan-upgrade.md) */
export const USER_DAILY_CHECK_LIMIT = 200;

/** 체크 요청 본문 상한 */
export const CHECK_BODY_MAX_BYTES = 256;

export interface CheckRequest extends Slot {
  eaten: boolean;
}

/** PUT 본문 { day, meal, eaten }. 모양이 틀리면 null */
export function parseCheckBody(raw: string): CheckRequest | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const { day, meal, eaten } = body as Record<string, unknown>;
  if (!isDay(day) || !isMeal(meal) || typeof eaten !== 'boolean') return null;
  return { day, meal, eaten };
}

/** 칸 순서: 요일(DAYS) → 끼니(MEAL_TYPES) */
export function compareSlots(a: Slot, b: Slot): number {
  return DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || MEAL_TYPES.indexOf(a.meal) - MEAL_TYPES.indexOf(b.meal);
}

export function isDay(value: unknown): value is Day {
  return typeof value === 'string' && (DAYS as readonly string[]).includes(value);
}

export function isMeal(value: unknown): value is MealType {
  return typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value);
}
