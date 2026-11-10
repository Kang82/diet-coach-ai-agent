// 식단표 칸 "먹었어요" 체크의 화면 상태 (tasks.md T25, Task2 R2). 서버는 /api/checks/:conversationId (server/check-routes.ts).
// 누르면 바로 바꾸고(낙관적) 저장이 실패하면 되돌린다. 체크한 칸은 "다시 추천"을 숨긴다(먹은 칸을 바꾸면 기록이 어긋난다).
import { sameSlot } from '../core/helpers.ts';
import { compareSlots, isDay, isMeal } from '../core/plan-check.ts';
import type { PlanCell, Slot } from '../core/types.ts';

/** 체크 목록에 칸을 넣거나 뺀다. 칸 순서로 정렬하고 같은 칸은 하나만 */
export function withCheck(checks: readonly Slot[], slot: Slot, eaten: boolean): Slot[] {
  const rest = checks.filter((c) => !sameSlot(c, slot));
  return eaten ? [...rest, { day: slot.day, meal: slot.meal }].sort(compareSlots) : rest;
}

export function isChecked(checks: readonly Slot[], slot: Slot): boolean {
  return checks.some((c) => sameSlot(c, slot));
}

/** 식단표 아래 요약. 일정 칸은 식단표 칸이 아니라 세지 않고, 지금 식단표에 없는 칸의 체크도 세지 않는다 */
export function checkSummary(cells: readonly PlanCell[], checks: readonly Slot[]): string {
  const eaten = cells.filter((cell) => isChecked(checks, cell)).length;
  return `이번 주 ${eaten}/${cells.length}칸 먹었어요`;
}

/** GET 응답 { checks }. 모양이 틀린 항목은 버린다 */
export function parseChecks(body: unknown): Slot[] {
  const list = (body as { checks?: unknown } | null)?.checks;
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is Slot => isDay((c as Slot | null)?.day) && isMeal((c as Slot | null)?.meal))
    .map((c) => ({ day: c.day, meal: c.meal }))
    .sort(compareSlots);
}

const SAVE_FAILED = '체크를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.';

export async function fetchChecks(token: string, conversationId: string, fetcher: typeof fetch = fetch): Promise<Slot[] | null> {
  try {
    const res = await fetcher(`/api/checks/${encodeURIComponent(conversationId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return parseChecks(await res.json());
  } catch {
    return null;
  }
}

/** 저장 결과. 실패면 화면에 보일 문구(서버 문구가 있으면 그것) */
export async function saveCheck(
  token: string,
  conversationId: string,
  slot: Slot,
  eaten: boolean,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetcher(`/api/checks/${encodeURIComponent(conversationId)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ day: slot.day, meal: slot.meal, eaten }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
    const message = body?.error?.message;
    return { ok: false, message: res.status === 429 && typeof message === 'string' ? message : SAVE_FAILED };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}
