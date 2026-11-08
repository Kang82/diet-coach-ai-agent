// 메뉴 분류 요청과 식단표 만들기 메시지 (스펙 4.2, tasks.md B5, B6).
// 메뉴 분류 요청에는 기간 선택 화면의 일정을 싣는다 (B6). classify_menus가 검증해 기간과 함께 저장한다.
// 화면이 이 형식으로 보내면 classify_menus, create_week_plan 도구가 useDelivery()로 직접 읽는다.
// 사용자가 바꾼 분류는 모델이 옮겨 적지 않고 메시지 JSON으로 도구에 넘어간다 (edit-request.ts와 같은 방식).
import { classesForPlan, type MenuClassOverride } from './menu-classification.ts';
import { CRITERION_IDS, DAYS, MEAL_TYPES, MENU_CLASSES, type CriterionId, type MealSetting, type MenuClassification, type PlanEvent } from './types.ts';

export const CLASSIFY_REQUEST = '메뉴 분류 요청';
export const PLAN_REQUEST_PREFIX = '식단표 만들기:';

export interface PlanRequest {
  /** 분류 확인 화면에서 사용자가 바꾼 분류. 바꾸지 않았으면 빈 배열 */
  overrides: MenuClassOverride[];
}

export interface ClassifyRequest {
  /** 기간 선택 화면에서 넣은 일정 (B6). 옛 형식("메뉴 분류 요청"만)이면 빈 배열 */
  events: PlanEvent[];
  /**
   * 이전 대화에서 정한 분류 (B16 T12-4, "외식 메뉴 고치기"). 같은 이름 메뉴는 이 값을 쓰고 새 메뉴만 모델에 보낸다.
   * 사용자가 분류 화면에서 마음대로 바꿀 수 있는 값(overrides)과 같은 수준이라 받아도 되지만, 개수·길이는 제한한다
   */
  known?: MenuClassification[];
}

/** 이월 분류 제한 (본문 32KB 안) */
export const KNOWN_LIMITS = { count: 100, menu: 100, reason: 300, tips: 5, tip: 100 } as const;

/** 일정 메모 길이가 이보다 길면 형식 오류로 본다. 화면 제한(EVENT_NOTE_MAX)보다 넉넉하게 둔다 */
const RAW_NOTE_MAX = 200;

/** `메뉴 분류 요청` 또는 `메뉴 분류 요청:` + JSON. 형식이 깨졌어도 요청으로 본다(도구가 bad_request로 답한다) */
export function isClassifyRequest(body: string): boolean {
  const text = body.trim();
  return text === CLASSIFY_REQUEST || text.startsWith(`${CLASSIFY_REQUEST}:`);
}

export function formatClassifyRequest({ events, known }: ClassifyRequest): string {
  const body = {
    events: events.map(({ day, meal, note }) => ({ day, meal, note })),
    ...(known && known.length > 0
      ? { known: known.map(({ menu, class: c, reason, criterionIds, orderTips }) => ({ menu, class: c, reason, criterionIds, orderTips })) }
      : {}),
  };
  return `${CLASSIFY_REQUEST}:\n${JSON.stringify(body)}`;
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
  const rawKnown = (json as { known?: unknown }).known;
  if (rawKnown === undefined) return { events: parsed };
  const known = parseKnown(rawKnown);
  return known ? { events: parsed, known } : undefined;
}

/** 이월 분류 검증. 하나라도 형식이 틀리면 undefined. 모르는 기준 ID는 버린다(지금 기준으로는 runClassification이 다시 거른다) */
function parseKnown(value: unknown): MenuClassification[] | undefined {
  if (!Array.isArray(value) || value.length > KNOWN_LIMITS.count) return undefined;
  const known: MenuClassification[] = [];
  for (const k of value) {
    const { menu, class: c, reason, criterionIds, orderTips } = (k ?? {}) as Record<string, unknown>;
    if (typeof menu !== 'string' || menu.trim() === '' || menu.length > KNOWN_LIMITS.menu) return undefined;
    if (!MENU_CLASSES.includes(c as never)) return undefined;
    if (typeof reason !== 'string' || reason.length > KNOWN_LIMITS.reason) return undefined;
    if (!Array.isArray(criterionIds) || !criterionIds.every((id) => typeof id === 'string')) return undefined;
    if (!Array.isArray(orderTips) || orderTips.length > KNOWN_LIMITS.tips) return undefined;
    if (!orderTips.every((t) => typeof t === 'string' && t.length <= KNOWN_LIMITS.tip)) return undefined;
    known.push({
      menu,
      class: c as MenuClassification['class'],
      reason,
      criterionIds: (criterionIds as string[]).filter((id): id is CriterionId => (CRITERION_IDS as readonly string[]).includes(id)),
      orderTips: orderTips as string[],
    });
  }
  return known;
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

export type ResolvedPlanClasses =
  | { kind: 'ok'; classes: MenuClassification[] }
  /** `식단표 만들기:`로 시작하는데 형식이 깨짐. 바꾼 분류를 조용히 버리지 않고 알린다 (tasks.md T9-1) */
  | { kind: 'bad_request' }
  /** 인터뷰가 없거나 분류가 끝나지 않음 */
  | { kind: 'no_classes' };

/**
 * create_week_plan이 쓸 분류. body는 사용자 메시지 본문(사용자 메시지가 아니면 undefined).
 * 정해진 형식 밖 메시지("식단표 만들어 줘")는 바꾼 분류 없이 저장된 분류를 쓴다.
 */
export function resolvePlanClasses(
  body: string | undefined,
  meals: readonly MealSetting[] | undefined,
  stored: readonly MenuClassification[] | undefined,
): ResolvedPlanClasses {
  const request = body === undefined ? undefined : parsePlanRequest(body);
  if (body !== undefined && isPlanRequest(body) && !request) return { kind: 'bad_request' };
  const classes = meals && classesForPlan(meals, stored, request?.overrides);
  return classes ? { kind: 'ok', classes } : { kind: 'no_classes' };
}
