// B13(T10-2, T10-3). 화면이 보낸 메시지 종류. 미들웨어(횟수·예약)와 에이전트(도구 마운트)가 함께 쓴다.
import { describe, expect, it } from 'vitest';
import { formatEditRequest } from './edit-request.ts';
import { formatInterviewSubmission } from './interview-form.ts';
import { EXPENSIVE_KINDS, messageKind } from './message-kind.ts';
import { formatClassifyRequest, formatPlanRequest } from './plan-request.ts';

describe('messageKind', () => {
  it('화면이 만든 메시지는 그 종류', () => {
    const draft = { goals: [], goalNote: '', medication: 'none', avoid: [], avoidNote: '', meals: [] } as never;
    expect(messageKind(formatInterviewSubmission({ draft, stopFlags: [] }))).toBe('interview');
    expect(messageKind(formatClassifyRequest({ events: [] }))).toBe('classify');
    expect(messageKind('메뉴 분류 요청')).toBe('classify');
    expect(messageKind(formatPlanRequest({ overrides: [] }))).toBe('plan');
    expect(messageKind(formatEditRequest({ target: { day: 'tue', meal: 'lunch' }, request: '다른 걸로' }))).toBe('edit');
  });

  it('앞 공백은 무시한다 (각 도구의 is* 함수와 같게)', () => {
    expect(messageKind('  식단표 만들기:\n{"overrides":[]}')).toBe('plan');
    expect(messageKind('\n칸 다시 추천: 화요일 점심')).toBe('edit');
  });

  it('형식이 깨져도 접두어가 맞으면 그 종류다 (도구가 bad_request로 답한다)', () => {
    expect(messageKind('식단표 만들기: {깨짐')).toBe('plan');
    expect(messageKind('메뉴 분류 요청: {깨짐')).toBe('classify');
  });

  it('자유 문장과 접두어가 중간에 있는 문장은 chat', () => {
    expect(messageKind('식단표 만들어 줘')).toBe('chat');
    expect(messageKind('메뉴 분류 요청해 줘')).toBe('chat');
    expect(messageKind('안녕 식단표 만들기:')).toBe('chat');
    expect(messageKind('')).toBe('chat');
  });

  it('비싼 종류는 분류·만들기·칸 수정', () => {
    expect(EXPENSIVE_KINDS).toEqual(['classify', 'plan', 'edit']);
  });
});
