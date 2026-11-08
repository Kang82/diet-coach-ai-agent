// 지난 식단표 목록 (tasks.md T17)
import { describe, expect, it } from 'vitest';
import { fetchPastPlans, PAST_PLANS_TEXT, parsePastPlans, pastPlanLabel, pastPlansView } from './past-plans.ts';

const a = { conversationId: 'u1-a', weekStart: '2026-11-09', planAt: '2026-11-08T11:43:00.000Z' };
const b = { conversationId: 'u1-b', weekStart: '2026-11-16', planAt: '2026-11-08T15:05:00.000Z' };

describe('parsePastPlans', () => {
  it('items를 읽고 모양이 틀린 항목은 뺀다', () => {
    expect(parsePastPlans({ items: [a, { conversationId: 1 }, b, null, { ...a, weekStart: '11월' }] })).toEqual([a, b]);
  });

  it('items가 없으면 undefined (요청 실패와 같게)', () => {
    expect(parsePastPlans({})).toBeUndefined();
    expect(parsePastPlans(null)).toBeUndefined();
  });
});

describe('fetchPastPlans', () => {
  it('토큰을 붙여 GET하고 목록을 돌려준다. 실패하면 undefined', async () => {
    const calls: { input: string; init?: RequestInit }[] = [];
    const ok = async (input: string, init?: RequestInit) => (calls.push({ input, init }), Response.json({ items: [a] }));
    expect(await fetchPastPlans('tok', ok)).toEqual([a]);
    expect(calls[0]?.input).toBe('/api/conversations');
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(await fetchPastPlans('tok', async () => new Response('', { status: 500 }))).toBeUndefined();
    expect(await fetchPastPlans('tok', async () => Promise.reject(new Error('offline')))).toBeUndefined();
  });
});

describe('pastPlanLabel', () => {
  it('시작 월요일과 만든 시각(한국 시간)', () => {
    expect(pastPlanLabel(a)).toBe('11/9(월)부터 1주일 · 11/8 20:43');
    // 15:05 UTC는 한국 시간으로 다음 날 0:05
    expect(pastPlanLabel(b)).toBe('11/16(월)부터 1주일 · 11/9 00:05');
  });
});

describe('pastPlansView', () => {
  it('처음에는 링크만, 불러오는 중, 실패, 빈 목록', () => {
    expect(pastPlansView({ kind: 'idle' }, 'u1-a')).toEqual({ link: true });
    expect(pastPlansView({ kind: 'loading' }, 'u1-a')).toEqual({ message: PAST_PLANS_TEXT.loading });
    expect(pastPlansView({ kind: 'error' }, 'u1-a')).toEqual({ message: PAST_PLANS_TEXT.error, link: true });
    expect(pastPlansView({ kind: 'list', items: [] }, 'u1-a')).toEqual({ message: PAST_PLANS_TEXT.empty, close: true });
  });

  it('목록은 항목마다 문구와 지금 보는 대화 표시', () => {
    expect(pastPlansView({ kind: 'list', items: [b, a] }, 'u1-a')).toEqual({
      items: [
        { conversationId: 'u1-b', label: pastPlanLabel(b), current: false },
        { conversationId: 'u1-a', label: pastPlanLabel(a), current: true },
      ],
      close: true,
    });
  });
});
