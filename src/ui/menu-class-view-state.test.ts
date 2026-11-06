// 메뉴 분류 화면 상태: 요청 메시지와 classify_menus 결과로 지금 화면을 정한다 (스펙 4.2, tasks.md B5)
import { describe, expect, it } from 'vitest';
import { classesA } from '../core/__fixtures__/persona-a.ts';
import type { ClassifyToolOutput } from '../core/classify-tool-output.ts';
import { CLASSIFY_REQUEST, formatClassifyRequest, formatPlanRequest } from '../core/plan-request.ts';
import {
  assistantMsg,
  doneTool,
  erroredTool,
  pendingTool,
  settledSub,
  userMsg,
  viewInput,
} from './__fixtures__/conversation.ts';
import { CLASSIFY_ERROR, CLASSIFY_TOOL, toMenuClassViewState } from './menu-class-view-state.ts';

const stats = { seconds: 5, usages: [], neurons: 60 };
const period = { weekStart: '2026-11-09', events: [{ day: 'wed' as const, meal: 'dinner' as const, note: '회식' }] };
const ok: ClassifyToolOutput = { status: 'ok', classes: classesA, period, stats };
const out = (output: ClassifyToolOutput | string) => doneTool(CLASSIFY_TOOL, output);

describe('toMenuClassViewState', () => {
  it('기록을 읽기 전에는 loading, 요청 전에는 idle', () => {
    expect(toMenuClassViewState(viewInput({ historyReady: false }))).toEqual({ kind: 'loading' });
    expect(toMenuClassViewState(viewInput({}))).toEqual({ kind: 'idle' });
  });

  it('요청 직후와 도구 실행 중에는 classifying과 요청 시각', () => {
    const sent = [userMsg(CLASSIFY_REQUEST, 's1', '2026-11-06T08:00:00Z')];
    expect(toMenuClassViewState(viewInput({ status: 'submitted', messages: sent }))).toEqual({
      kind: 'classifying',
      startedAt: '2026-11-06T08:00:00Z',
    });
    expect(
      toMenuClassViewState(viewInput({ status: 'streaming', messages: [...sent, assistantMsg('s1', pendingTool(CLASSIFY_TOOL))] })),
    ).toEqual({ kind: 'classifying', startedAt: '2026-11-06T08:00:00Z' });
  });

  it('분류가 끝나면 classified, 그 뒤 메시지는 식단표 화면 몫 (문자열 출력도 읽는다)', () => {
    const after = [userMsg(formatPlanRequest({ overrides: [] }), 's2'), assistantMsg('s2', pendingTool('create_week_plan'))];
    const messages = [userMsg(CLASSIFY_REQUEST, 's1'), assistantMsg('s1', out(JSON.stringify(ok))), ...after];
    expect(toMenuClassViewState(viewInput({ messages, settlements: [settledSub('s1')] }))).toEqual({
      kind: 'classified',
      classes: classesA,
      period,
      planMessages: after,
    });
  });

  it('한도 초과면 idle과 안내 (다시 요청할 수 있다)', () => {
    const quota: ClassifyToolOutput = { status: 'quota', message: '오전 9시 이후에', stats };
    const messages = [userMsg(CLASSIFY_REQUEST, 's1'), assistantMsg('s1', out(quota))];
    expect(toMenuClassViewState(viewInput({ messages, settlements: [settledSub('s1')] }))).toEqual({
      kind: 'idle',
      alert: '오전 9시 이후에',
    });
  });

  it.each([
    ['도구 에러', [assistantMsg('s1', erroredTool(CLASSIFY_TOOL))], []],
    ['결과 없이 끝난 요청', [], [settledSub('s1', 'failed')]],
  ])('%s면 idle과 실패 안내', (_, more, settlements) => {
    const messages = [userMsg(CLASSIFY_REQUEST, 's1'), ...more];
    expect(toMenuClassViewState(viewInput({ messages, settlements }))).toEqual({ kind: 'idle', alert: CLASSIFY_ERROR });
  });

  it('실패 뒤 다시 요청하면 classifying', () => {
    const messages = [
      userMsg(CLASSIFY_REQUEST, 's1'),
      assistantMsg('s1', erroredTool(CLASSIFY_TOOL)),
      userMsg(CLASSIFY_REQUEST, 's2', '2026-11-06T08:01:00Z'),
    ];
    expect(toMenuClassViewState(viewInput({ status: 'submitted', messages, settlements: [settledSub('s1')] }))).toEqual({
      kind: 'classifying',
      startedAt: '2026-11-06T08:01:00Z',
    });
  });

  it('일정이 맞지 않으면 idle과 도구의 안내', () => {
    const bad: ClassifyToolOutput = { status: 'bad_request', message: '일정을 읽지 못했어요', issues: [], stats };
    const messages = [userMsg(formatClassifyRequest({ events: [] }), 's1'), assistantMsg('s1', out(bad))];
    expect(toMenuClassViewState(viewInput({ messages, settlements: [settledSub('s1')] }))).toEqual({
      kind: 'idle',
      alert: '일정을 읽지 못했어요',
    });
  });

  it('요청이 아닌 사용자 메시지는 보지 않는다', () => {
    expect(toMenuClassViewState(viewInput({ messages: [userMsg('안녕', 's1')], settlements: [settledSub('s1')] }))).toEqual({
      kind: 'idle',
    });
  });
});
