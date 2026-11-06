// 식단표 화면 상태: 대화 메시지와 연결 상태에서 무엇을 보여 줄지 정한다 (스펙 7장, 7.1, 4.4-4)
import type { FlueConversationMessage, FlueConversationSettlement } from '@flue/sdk';
import { describe, expect, it } from 'vitest';
import { planA } from '../core/__fixtures__/persona-a.ts';
import { formatEditRequest } from '../core/edit-request.ts';
import type { EditToolOutput, PlanToolOutput } from '../core/plan-tool-output.ts';
import type { Plan } from '../core/types.ts';
import { EDIT_FAILED, GENERIC_ERROR, toPlanViewState, type PlanViewInput } from './plan-view-state.ts';

type Part = FlueConversationMessage['parts'][number];
type ToolPart = Extract<Part, { type: 'dynamic-tool' }>;

const stats = { seconds: 240, regenerations: 0, usages: [], neurons: 250 };
const ok: PlanToolOutput = { status: 'ok', plan: planA, summary: ['같은 메뉴 연속 없음'], notices: ['안내'], stats };
const quota: PlanToolOutput = { status: 'quota', message: '내일 다시', stats };
const CREATE = '식단표 만들어 줘';
const EDIT = formatEditRequest({ target: { day: 'tue', meal: 'lunch' }, request: '생선 말고' });

const editedPlan: Plan = {
  ...planA,
  cells: planA.cells.map((c) => (c.day === 'tue' && c.meal === 'lunch' ? { ...c, title: '쌀국수' } : c)),
};
const editOk = (patch: Partial<Extract<EditToolOutput, { status: 'ok' }>> = {}): EditToolOutput => ({
  status: 'ok',
  plan: editedPlan,
  summary: ['바뀐 요약'],
  notices: ['안내'],
  targets: [{ day: 'tue', meal: 'lunch' }],
  changed: [{ day: 'tue', meal: 'lunch' }],
  unchangedTargets: [],
  stats,
  ...patch,
});

let seq = 0;
const userMsg = (text: string, sub: string, timestamp?: string): FlueConversationMessage => ({
  id: `u${++seq}`,
  role: 'user',
  purpose: 'user',
  display: 'visible',
  submissionId: sub,
  ...(timestamp ? { timestamp } : {}),
  parts: [{ type: 'text', text, state: 'done' }],
});
const assistantMsg = (sub: string, ...parts: Part[]): FlueConversationMessage => ({
  id: `a${++seq}`,
  role: 'assistant',
  purpose: 'assistant',
  display: 'visible',
  submissionId: sub,
  parts,
});
const pending = (toolName = 'create_week_plan'): ToolPart => ({
  type: 'dynamic-tool',
  toolName,
  toolCallId: `t${++seq}`,
  state: 'input-available',
  input: {},
});
const done = (output: unknown, toolName = 'create_week_plan'): ToolPart => ({
  type: 'dynamic-tool',
  toolName,
  toolCallId: `t${++seq}`,
  state: 'output-available',
  input: {},
  output,
});
const errored = (toolName = 'create_week_plan'): ToolPart => ({
  type: 'dynamic-tool',
  toolName,
  toolCallId: `t${++seq}`,
  state: 'output-error',
  input: {},
  errorText: 'boom',
});
const settled = (sub: string, outcome: FlueConversationSettlement['outcome'] = 'completed'): FlueConversationSettlement => ({
  submissionId: sub,
  outcome,
});

const input = (patch: Partial<PlanViewInput>): PlanViewInput => ({
  historyReady: true,
  status: 'idle',
  messages: [],
  settlements: [],
  ...patch,
});

/** 식단표를 만든 대화 (s1) */
const created = () => [userMsg(CREATE, 's1'), assistantMsg('s1', done(ok))];

describe('toPlanViewState: 만들기', () => {
  it('기록을 읽기 전에는 loading', () => {
    expect(toPlanViewState(input({ historyReady: false }))).toEqual({ kind: 'loading' });
  });

  it('메시지가 없으면 idle', () => {
    expect(toPlanViewState(input({}))).toEqual({ kind: 'idle' });
  });

  it('보낸 직후(도구 호출 전)에도 creating. 시작 시각은 사용자 메시지 시각', () => {
    const state = toPlanViewState(input({ status: 'submitted', messages: [userMsg(CREATE, 's1', '2026-11-06T03:00:00Z')] }));
    expect(state).toEqual({ kind: 'creating', startedAt: '2026-11-06T03:00:00Z' });
  });

  it('도구가 실행 중이면 creating (새로고침 뒤 connecting이어도)', () => {
    const state = toPlanViewState(input({ status: 'connecting', messages: [userMsg(CREATE, 's1'), assistantMsg('s1', pending())] }));
    expect(state).toEqual({ kind: 'creating', startedAt: undefined });
  });

  it('결과가 ok면 done과 식단표', () => {
    const state = toPlanViewState(input({ messages: created(), settlements: [settled('s1')] }));
    expect(state).toEqual({ kind: 'done', view: { plan: planA, summary: ok.summary, notices: ok.notices } });
  });

  it('도구 결과가 JSON 문자열로 와도 읽는다', () => {
    const state = toPlanViewState(input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', done(JSON.stringify(ok)))] }));
    expect(state.kind).toBe('done');
  });

  it('violations는 식단표 없이 안내만', () => {
    const output: PlanToolOutput = { status: 'violations', message: '어려웠어요', violations: [], lastPlan: planA, stats };
    expect(toPlanViewState(input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', done(output))] }))).toEqual({
      kind: 'violations',
      message: '어려웠어요',
    });
  });

  it('quota는 한도 안내', () => {
    expect(toPlanViewState(input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', done(quota))] }))).toEqual({
      kind: 'quota',
      message: '내일 다시',
    });
  });

  it('도구 에러, 알 수 없는 결과, 도구 없이 끝난 답, 실패한 제출, 연결 오류는 error', () => {
    const text: Part = { type: 'text', text: '무엇을 도와드릴까요?', state: 'done' };
    const cases: PlanViewInput[] = [
      input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', errored())] }),
      input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', done('not json'))] }),
      input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', text)], settlements: [settled('s1')] }),
      input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', pending())], settlements: [settled('s1', 'failed')] }),
      input({ status: 'error', messages: [userMsg(CREATE, 's1')] }),
    ];
    for (const c of cases) expect(toPlanViewState(c)).toEqual({ kind: 'error', message: GENERIC_ERROR });
  });

  it('한 답에 도구 호출이 여러 번이면 마지막 것을 본다', () => {
    const state = toPlanViewState(input({ messages: [userMsg(CREATE, 's1'), assistantMsg('s1', done(quota), done(ok))] }));
    expect(state.kind).toBe('done');
  });
});

describe('toPlanViewState: 칸 다시 추천', () => {
  it('보낸 직후에는 지금 식단표와 editing(고른 칸, 시작 시각)', () => {
    const messages = [...created(), userMsg(EDIT, 's2', '2026-11-06T04:00:00Z')];
    expect(toPlanViewState(input({ status: 'submitted', messages, settlements: [settled('s1')] }))).toEqual({
      kind: 'done',
      view: { plan: planA, summary: ok.summary, notices: ok.notices },
      editing: { target: { day: 'tue', meal: 'lunch' }, startedAt: '2026-11-06T04:00:00Z' },
    });
  });

  it('도구 실행 중에도 지금 식단표와 editing', () => {
    const messages = [...created(), userMsg(EDIT, 's2'), assistantMsg('s2', pending('edit_plan_cells'))];
    const state = toPlanViewState(input({ messages, settlements: [settled('s1')] }));
    expect(state).toMatchObject({ kind: 'done', view: { plan: planA }, editing: { target: { day: 'tue', meal: 'lunch' } } });
  });

  it('성공하면 바뀐 식단표와 바꿨다는 알림', () => {
    const messages = [...created(), userMsg(EDIT, 's2'), assistantMsg('s2', done(editOk(), 'edit_plan_cells'))];
    expect(toPlanViewState(input({ messages, settlements: [settled('s1'), settled('s2')] }))).toEqual({
      kind: 'done',
      view: { plan: editedPlan, summary: ['바뀐 요약'], notices: ['안내'] },
      editNotice: { tone: 'info', messages: ['화요일 점심을 바꿨어요.'], changed: [{ day: 'tue', meal: 'lunch' }] },
    });
  });

  it('고르지 않은 칸도 바뀌었으면 알린다', () => {
    const output = editOk({ changed: [{ day: 'tue', meal: 'lunch' }, { day: 'wed', meal: 'lunch' }] });
    const messages = [...created(), userMsg(EDIT, 's2'), assistantMsg('s2', done(output, 'edit_plan_cells'))];
    expect(toPlanViewState(input({ messages }))).toMatchObject({
      editNotice: {
        tone: 'warn',
        messages: ['화요일 점심을 바꿨어요.', '규칙을 지키려고 수요일 점심도 함께 바꿨어요.'],
        changed: [{ day: 'tue', meal: 'lunch' }, { day: 'wed', meal: 'lunch' }],
      },
    });
  });

  it('고른 칸의 메뉴가 그대로면 요청을 반영하지 못했다고 알린다', () => {
    const output = editOk({ unchangedTargets: [{ day: 'tue', meal: 'lunch' }] });
    const messages = [...created(), userMsg(EDIT, 's2'), assistantMsg('s2', done(output, 'edit_plan_cells'))];
    expect(toPlanViewState(input({ messages }))).toMatchObject({
      editNotice: { tone: 'warn', messages: ['화요일 점심은 같은 메뉴로 남았어요. 요청을 반영하지 못했어요.'] },
    });
  });

  it.each(['violations', 'quota', 'invalid_targets', 'stale_plan', 'no_plan', 'bad_request'] as const)(
    '실패(%s)하면 원래 식단표 그대로 + 이유',
    (status) => {
      const output: EditToolOutput = { status, message: '이유 문구' };
      const messages = [...created(), userMsg(EDIT, 's2'), assistantMsg('s2', done(output, 'edit_plan_cells'))];
      expect(toPlanViewState(input({ messages }))).toEqual({
        kind: 'done',
        view: { plan: planA, summary: ok.summary, notices: ok.notices },
        editNotice: { tone: 'error', messages: [EDIT_FAILED, '이유 문구'], changed: [] },
      });
    },
  );

  it('도구 에러나 실패한 제출도 원래 식단표 그대로 + 실패 알림', () => {
    const cases: PlanViewInput[] = [
      input({ messages: [...created(), userMsg(EDIT, 's2'), assistantMsg('s2', errored('edit_plan_cells'))] }),
      input({ messages: [...created(), userMsg(EDIT, 's2')], settlements: [settled('s1'), settled('s2', 'failed')] }),
      input({ status: 'error', messages: [...created(), userMsg(EDIT, 's2')] }),
    ];
    for (const c of cases) {
      expect(toPlanViewState(c)).toMatchObject({ kind: 'done', view: { plan: planA }, editNotice: { tone: 'error' } });
    }
  });

  it('여러 번 고치면 마지막 성공 식단표를 보여 주고, 이후 실패는 그 식단표를 그대로 둔다', () => {
    const fail: EditToolOutput = { status: 'violations', message: '못 찾음' };
    const messages = [
      ...created(),
      userMsg(EDIT, 's2'),
      assistantMsg('s2', done(editOk(), 'edit_plan_cells')),
      userMsg(EDIT, 's3'),
      assistantMsg('s3', done(fail, 'edit_plan_cells')),
    ];
    expect(toPlanViewState(input({ messages }))).toMatchObject({
      kind: 'done',
      view: { plan: editedPlan },
      editNotice: { tone: 'error', messages: [EDIT_FAILED, '못 찾음'] },
    });
  });
});
