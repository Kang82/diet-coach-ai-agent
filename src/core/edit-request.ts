// 칸 다시 추천 메시지 (스펙 4.4-4, tasks.md B2).
// 화면이 이 형식으로 메시지를 보내면 edit_plan_cells 도구가 useDelivery()로 직접 읽어 해석한다.
// 모델은 도구를 부르기만 하고 칸이나 요청 문구를 옮겨 적지 않는다 (모델이 도구 입력을 잘못 채운 적이 있다, T2-2).
import { DAY_LABELS, MEAL_LABELS } from './labels.ts';
import { DAYS, MEAL_TYPES, type Slot } from './types.ts';

export const EDIT_REQUEST_PREFIX = '칸 다시 추천:';
const REQUEST_PREFIX = '원하는 점:';
export const DEFAULT_EDIT_REQUEST = '다른 메뉴로 바꿔 주세요';

export interface EditRequest {
  target: Slot;
  request: string;
}

export function formatEditRequest({ target, request }: EditRequest): string {
  const text = oneLine(request) || DEFAULT_EDIT_REQUEST;
  return `${EDIT_REQUEST_PREFIX} ${DAY_LABELS[target.day]} ${MEAL_LABELS[target.meal]}\n${REQUEST_PREFIX} ${text}`;
}

export function isEditRequest(body: string): boolean {
  return body.trimStart().startsWith(EDIT_REQUEST_PREFIX);
}

/** 형식이 틀리거나 모르는 요일·끼니면 undefined */
export function parseEditRequest(body: string): EditRequest | undefined {
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const head = lines[0];
  if (!head?.startsWith(EDIT_REQUEST_PREFIX)) return undefined;

  const [dayLabel, mealLabel, ...rest] = head.slice(EDIT_REQUEST_PREFIX.length).trim().split(/\s+/);
  if (rest.length > 0) return undefined;
  const day = DAYS.find((d) => DAY_LABELS[d] === dayLabel);
  const meal = MEAL_TYPES.find((m) => MEAL_LABELS[m] === mealLabel);
  if (!day || !meal) return undefined;

  const requestLine = lines.find((line) => line.startsWith(REQUEST_PREFIX));
  const request = oneLine(requestLine?.slice(REQUEST_PREFIX.length) ?? '') || DEFAULT_EDIT_REQUEST;
  return { target: { day, meal }, request };
}

function oneLine(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ');
}
