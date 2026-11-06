// 식단표 화면 상태: 대화 메시지와 연결 상태에서 무엇을 보여 줄지 정한다 (스펙 7장, 7.1)
import type { FlueConversationMessage, FlueConversationSettlement } from '@flue/sdk';
import { describe, expect, it } from 'vitest';
import { planA } from '../core/__fixtures__/persona-a.ts';
import type { PlanToolOutput } from '../core/plan-tool-output.ts';
import { GENERIC_ERROR, toPlanViewState, type PlanViewInput } from './plan-view-state.ts';

type Part = FlueConversationMessage['parts'][number];
type ToolPart = Extract<Part, { type: 'dynamic-tool' }>;

const stats = { seconds: 240, regenerations: 0, usages: [], neurons: 250 };
const ok: PlanToolOutput = { status: 'ok', plan: planA, summary: ['같은 메뉴 연속 없음'], notices: ['안내'], stats };
const quota: PlanToolOutput = { status: 'quota', message: '내일 다시', stats };

const userMsg = (timestamp?: string): FlueConversationMessage => ({
  id: 'u1',
  role: 'user',
  purpose: 'user',
  display: 'visible',
  submissionId: 's1',
  ...(timestamp ? { timestamp } : {}),
  parts: [{ type: 'text', text: '식단표 만들어 줘', state: 'done' }],
});
const assistantMsg = (...parts: Part[]): FlueConversationMessage => ({
  id: 'a1',
  role: 'assistant',
  purpose: 'assistant',
  display: 'visible',
  submissionId: 's1',
  parts,
});
const pending = (id = 't1'): ToolPart => ({
  type: 'dynamic-tool',
  toolName: 'create_week_plan',
  toolCallId: id,
  state: 'input-available',
  input: {},
});
const done = (output: unknown, id = 't1'): ToolPart => ({
  type: 'dynamic-tool',
  toolName: 'create_week_plan',
  toolCallId: id,
  state: 'output-available',
  input: {},
  output,
});
const settled = (outcome: FlueConversationSettlement['outcome']): FlueConversationSettlement => ({
  submissionId: 's1',
  outcome,
});

const input = (patch: Partial<PlanViewInput>): PlanViewInput => ({
  historyReady: true,
  status: 'idle',
  messages: [],
  settlements: [],
  ...patch,
});

describe('toPlanViewState', () => {
  it('기록을 읽기 전에는 loading', () => {
    expect(toPlanViewState(input({ historyReady: false }))).toEqual({ kind: 'loading' });
  });

  it('메시지가 없으면 idle', () => {
    expect(toPlanViewState(input({}))).toEqual({ kind: 'idle' });
  });

  it('보낸 직후(도구 호출 전)에도 creating. 시작 시각은 사용자 메시지 시각', () => {
    const state = toPlanViewState(input({ status: 'submitted', messages: [userMsg('2026-11-06T03:00:00Z')] }));
    expect(state).toEqual({ kind: 'creating', startedAt: '2026-11-06T03:00:00Z' });
  });

  it('도구가 실행 중이면 creating', () => {
    const state = toPlanViewState(input({ status: 'streaming', messages: [userMsg(), assistantMsg(pending())] }));
    expect(state).toEqual({ kind: 'creating', startedAt: undefined });
  });

  it('새로고침 뒤 연결 중(status connecting)이어도 도구가 실행 중이면 creating', () => {
    const state = toPlanViewState(input({ status: 'connecting', messages: [userMsg(), assistantMsg(pending())] }));
    expect(state.kind).toBe('creating');
  });

  it('결과가 ok면 done과 도구 결과', () => {
    const state = toPlanViewState(input({ messages: [userMsg(), assistantMsg(done(ok))], settlements: [settled('completed')] }));
    expect(state).toEqual({ kind: 'done', output: ok });
  });

  it('도구 결과가 JSON 문자열로 와도 읽는다', () => {
    const state = toPlanViewState(input({ messages: [userMsg(), assistantMsg(done(JSON.stringify(ok)))] }));
    expect(state).toEqual({ kind: 'done', output: ok });
  });

  it('violations는 식단표 없이 안내만', () => {
    const output: PlanToolOutput = { status: 'violations', message: '어려웠어요', violations: [], lastPlan: planA, stats };
    expect(toPlanViewState(input({ messages: [userMsg(), assistantMsg(done(output))] }))).toEqual({
      kind: 'violations',
      message: '어려웠어요',
    });
  });

  it('quota는 한도 안내', () => {
    expect(toPlanViewState(input({ messages: [userMsg(), assistantMsg(done(quota))] }))).toEqual({
      kind: 'quota',
      message: '내일 다시',
    });
  });

  it('도구 에러는 error', () => {
    const part: ToolPart = {
      type: 'dynamic-tool',
      toolName: 'create_week_plan',
      toolCallId: 't1',
      state: 'output-error',
      input: {},
      errorText: 'boom',
    };
    expect(toPlanViewState(input({ messages: [userMsg(), assistantMsg(part)] }))).toEqual({
      kind: 'error',
      message: GENERIC_ERROR,
    });
  });

  it('알 수 없는 모양의 결과는 error', () => {
    expect(toPlanViewState(input({ messages: [userMsg(), assistantMsg(done('not json'))] })).kind).toBe('error');
  });

  it('도구를 부르지 않고 답이 끝나면 error', () => {
    const text: Part = { type: 'text', text: '무엇을 도와드릴까요?', state: 'done' };
    const state = toPlanViewState(input({ messages: [userMsg(), assistantMsg(text)], settlements: [settled('completed')] }));
    expect(state.kind).toBe('error');
  });

  it('도구 실행 중 제출이 실패로 끝나면 error', () => {
    const state = toPlanViewState(input({ messages: [userMsg(), assistantMsg(pending())], settlements: [settled('failed')] }));
    expect(state.kind).toBe('error');
  });

  it('연결 오류(status error)면 error', () => {
    expect(toPlanViewState(input({ status: 'error', messages: [userMsg()] })).kind).toBe('error');
  });

  it('도구 호출이 여러 번이면 마지막 것을 본다', () => {
    const state = toPlanViewState(input({ messages: [userMsg(), assistantMsg(done(quota, 't1'), done(ok, 't2'))] }));
    expect(state.kind).toBe('done');
  });
});
