// 메뉴 분류 요청과 식단표 만들기 메시지 (스펙 4.2, tasks.md B5, B6).
// 메뉴 분류 요청에는 기간 선택 화면의 일정을 싣는다 (B6). classify_menus가 검증해 기간과 함께 저장한다.
// 화면이 이 형식으로 보내면 classify_menus, create_week_plan 도구가 useDelivery()로 직접 읽는다.
// 사용자가 바꾼 분류는 모델이 옮겨 적지 않고 메시지 JSON으로 도구에 넘어간다 (edit-request.ts와 같은 방식).
import type { MenuClassOverride } from './menu-classification.ts';
import { DAYS, MEAL_TYPES, MENU_CLASSES, type PlanEvent } from './types.ts';

export const CLASSIFY_REQUEST = '메뉴 분류 요청';
export const PLAN_REQUEST_PREFIX = '식단표 만들기:';

export interface PlanRequest {
  /** 분류 확인 화면에서 사용자가 바꾼 분류. 바꾸지 않았으면 빈 배열 */
  overrides: MenuClassOverride[];
}

export interface ClassifyRequest {
  /** 기간 선택 화면에서 넣은 일정 (B6). 옛 형식("메뉴 분류 요청"만)이면 빈 배열 */
  events: PlanEvent[];
}

/** 일정 메모 길이가 이보다 길면 형식 오류로 본다. 화면 제한(EVENT_NOTE_MAX)보다 넉넉하게 둔다 */
const RAW_NOTE_MAX = 200;

/** `메뉴 분류 요청` 또는 `메뉴 분류 요청:` + JSON. 형식이 깨졌어도 요청으로 본다(도구가 bad_request로 답한다) */
export function isClassifyRequest(body: string): boolean {
  const text = body.trim();
  return text === CLASSIFY_REQUEST || text.startsWith(`${CLASSIFY_REQUEST}:`);
}

export function formatClassifyRequest({ events }: ClassifyRequest): string {
  return `${CLASSIFY_REQUEST}:\n${JSON.stringify({ events: events.map(({ day, meal, note }) => ({ day, meal, note })) })}`;
}

/** 형식이 틀리면 undefined. 일정이 그 사람의 끼니에 맞는지는 도구가 validateEvents로 본다 */
export function parseClassifyRequest(body: string): ClassifyRequest | undefined {
  const text = body.trim();
  if (text === CLASSIFY_REQUEST) return { events: [] };
  if (!text.startsWith(`${CLASSIFY_REQUEST}:`)) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(CLASSIFY_REQUEST.length + 1));
  } catch {
    return undefined;
  }
  const events = (json as { events?: unknown } | null)?.events;
  if (!Array.isArray(events) || events.length > 21) return undefined;
  const parsed: PlanEvent[] = [];
  for (const e of events) {
    const { day, meal, note } = (e ?? {}) as Record<string, unknown>;
    if (!DAYS.includes(day as never) || !MEAL_TYPES.includes(meal as never)) return undefined;
    if (typeof note !== 'string' || note.length > RAW_NOTE_MAX) return undefined;
    parsed.push({ day: day as PlanEvent['day'], meal: meal as PlanEvent['meal'], note });
  }
  return { events: parsed };
}

export function formatPlanRequest(request: PlanRequest): string {
  return `${PLAN_REQUEST_PREFIX}\n${JSON.stringify({ overrides: request.overrides.map(({ menu, class: c }) => ({ menu, class: c })) })}`;
}

export function isPlanRequest(body: string): boolean {
  return body.trimStart().startsWith(PLAN_REQUEST_PREFIX);
}

/** 형식이 틀리면 undefined. 모르는 메뉴인지는 도구가 저장된 분류와 비교한다(applyClassOverrides가 무시) */
export function parsePlanRequest(body: string): PlanRequest | undefined {
  if (!isPlanRequest(body)) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(body.trimStart().slice(PLAN_REQUEST_PREFIX.length));
  } catch {
    return undefined;
  }
  const overrides = (json as { overrides?: unknown } | null)?.overrides;
  if (!Array.isArray(overrides) || overrides.length > 100) return undefined;
  const parsed: MenuClassOverride[] = [];
  for (const o of overrides) {
    const { menu, class: c } = (o ?? {}) as Record<string, unknown>;
    if (typeof menu !== 'string' || !MENU_CLASSES.includes(c as never)) return undefined;
    parsed.push({ menu, class: c as MenuClassOverride['class'] });
  }
  return { overrides: parsed };
}
