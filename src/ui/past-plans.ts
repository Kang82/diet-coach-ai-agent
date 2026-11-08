// 지난 식단표 목록 (tasks.md T17, 스펙 7장). 화면 아래 "지난 식단표"를 누르면 식단표를 만들었거나 고친 대화를 최근 순으로 보여 주고,
// 누르면 그 대화로 옮긴다(App.tsx openConversation). 대화는 그대로 다시 읽으므로 식단표와 칸 수정이 이어진다.
import type { PlanConversation } from '../storage/guard-store.ts';

export type PastPlan = PlanConversation;

export type PastPlansState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'list'; items: PastPlan[] } | { kind: 'error' };

export const PAST_PLANS_TEXT = {
  link: '지난 식단표',
  loading: '불러오는 중…',
  error: '목록을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  empty: '아직 만든 식단표가 없어요. 이 기능을 넣은 뒤(2026-11-08) 만든 식단표부터 보여요.',
  current: '지금 보는 식단표',
  close: '닫기',
} as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 실패하면 undefined */
export async function fetchPastPlans(token: string, fetchFn: FetchLike = fetch): Promise<PastPlan[] | undefined> {
  try {
    const res = await fetchFn('/api/conversations', { headers: { authorization: `Bearer ${token}` } });
    return res.ok ? parsePastPlans(await res.json()) : undefined;
  } catch {
    return undefined;
  }
}

/** 모양이 틀린 항목은 뺀다. items가 없으면 undefined */
export function parsePastPlans(body: unknown): PastPlan[] | undefined {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return undefined;
  return items.filter(
    (i): i is PastPlan =>
      typeof i === 'object' &&
      i !== null &&
      typeof (i as PastPlan).conversationId === 'string' &&
      typeof (i as PastPlan).weekStart === 'string' &&
      DATE.test((i as PastPlan).weekStart) &&
      typeof (i as PastPlan).planAt === 'string' &&
      !Number.isNaN(Date.parse((i as PastPlan).planAt)),
  );
}

/** "11/9(월)부터 1주일 · 11/8 20:43" (만든 시각은 한국 시간) */
export function pastPlanLabel(item: PastPlan): string {
  const [y, m, d] = item.weekStart.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const kst = new Date(Date.parse(item.planAt) + 9 * 3_600_000);
  const at = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
  return `${m}/${d}(${weekday})부터 1주일 · ${at}`;
}

export interface PastPlansView {
  /** "지난 식단표" 링크 (처음, 실패 뒤 다시) */
  link?: true;
  message?: string;
  items?: { conversationId: string; label: string; current: boolean }[];
  /** 펼친 목록을 접는 버튼 */
  close?: true;
}

export function pastPlansView(state: PastPlansState, currentConversationId: string): PastPlansView {
  switch (state.kind) {
    case 'idle':
      return { link: true };
    case 'loading':
      return { message: PAST_PLANS_TEXT.loading };
    case 'error':
      return { message: PAST_PLANS_TEXT.error, link: true };
    case 'list':
      if (state.items.length === 0) return { message: PAST_PLANS_TEXT.empty, close: true };
      return {
        items: state.items.map((i) => ({
          conversationId: i.conversationId,
          label: pastPlanLabel(i),
          current: i.conversationId === currentConversationId,
        })),
        close: true,
      };
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
