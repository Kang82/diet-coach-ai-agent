// 메뉴 분류 요청과 식단표 만들기 메시지 (스펙 4.2, tasks.md B5).
// 화면이 이 형식으로 보내면 classify_menus, create_week_plan 도구가 useDelivery()로 직접 읽는다.
// 사용자가 바꾼 분류는 모델이 옮겨 적지 않고 메시지 JSON으로 도구에 넘어간다 (edit-request.ts와 같은 방식).
import type { MenuClassOverride } from './menu-classification.ts';
import { MENU_CLASSES } from './types.ts';

export const CLASSIFY_REQUEST = '메뉴 분류 요청';
export const PLAN_REQUEST_PREFIX = '식단표 만들기:';

export interface PlanRequest {
  /** 분류 확인 화면에서 사용자가 바꾼 분류. 바꾸지 않았으면 빈 배열 */
  overrides: MenuClassOverride[];
}

export function isClassifyRequest(body: string): boolean {
  return body.trim() === CLASSIFY_REQUEST;
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
