// 인터뷰 화면 상태: 제출 메시지와 submit_interview 결과로 지금 화면을 정한다 (스펙 4.1, 7장, tasks.md B4)
import { describe, expect, it } from 'vitest';
import { profileA } from '../core/__fixtures__/persona-a.ts';
import { formatInterviewSubmission } from '../core/interview-form.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import {
  assistantMsg,
  doneTool,
  erroredTool,
  pendingTool,
  settledSub,
  userMsg,
  viewInput,
} from './__fixtures__/conversation.ts';
import { INTERVIEW_ERROR, INTERVIEW_TOOL, toInterviewViewState } from './interview-view-state.ts';

const stats = { seconds: 3, usages: [], neurons: 20 };
const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
const resultA = { goals, goalNote, medication, avoid, avoidNote, meals };
const SUBMIT = formatInterviewSubmission({ draft: { goals: ['weight_loss'] }, stopFlags: [] });
const out = (output: InterviewToolOutput) => doneTool(INTERVIEW_TOOL, output);
const ask: InterviewToolOutput = {
  status: 'ask',
  message: { text: '다시 정해 주세요', choices: ['한 달에 2kg 감량'] },
  state: { draft: { goals: ['weight_loss'] }, stopFlags: [], menuFollowUps: [] },
  next: { kind: 'ask', field: 'goals', reason: 'extreme_restriction', choices: ['한 달에 2kg 감량'] },
  stats,
};

describe('toInterviewViewState', () => {
  it('기록을 읽기 전에는 loading', () => {
    expect(toInterviewViewState(viewInput({ historyReady: false }))).toEqual({ kind: 'loading' });
  });

  it('빈 대화면 form', () => {
    expect(toInterviewViewState(viewInput({}))).toEqual({ kind: 'form' });
  });

  it('제출 직후와 도구 실행 중에는 submitting', () => {
    const sent = [userMsg(SUBMIT, 's1')];
    expect(toInterviewViewState(viewInput({ status: 'submitted', messages: sent }))).toEqual({ kind: 'submitting' });
    expect(
      toInterviewViewState(viewInput({ status: 'streaming', messages: [...sent, assistantMsg('s1', pendingTool(INTERVIEW_TOOL))] })),
    ).toEqual({ kind: 'submitting' });
  });

  it('제출이 아닌 사용자 메시지는 보지 않는다', () => {
    expect(toInterviewViewState(viewInput({ messages: [userMsg('안녕', 's1')], settlements: [settledSub('s1')] }))).toEqual({
      kind: 'form',
    });
  });

  it('도구 에러 뒤 모델이 다시 부른 호출이 실행 중이면 submitting (리뷰 2번)', () => {
    const messages = [userMsg(SUBMIT, 's1'), assistantMsg('s1', erroredTool(INTERVIEW_TOOL), pendingTool(INTERVIEW_TOOL))];
    expect(toInterviewViewState(viewInput({ status: 'streaming', messages }))).toEqual({ kind: 'submitting' });
  });

  it('서버가 목표를 다시 물으면 form과 serverAsk(도구 호출 ID)', () => {
    const part = out(ask);
    const state = toInterviewViewState(viewInput({ messages: [userMsg(SUBMIT, 's1'), assistantMsg('s1', part)], settlements: [settledSub('s1')] }));
    expect(state).toEqual({ kind: 'form', serverAsk: { id: part.toolCallId, output: ask } });
  });

  it('중단이면 stopped', () => {
    const stop: InterviewToolOutput = { status: 'stop', message: { text: '상담해 주세요' }, stats };
    const messages = [userMsg(SUBMIT, 's1'), assistantMsg('s1', out(stop))];
    expect(toInterviewViewState(viewInput({ messages, settlements: [settledSub('s1')] }))).toEqual({
      kind: 'stopped',
      message: { text: '상담해 주세요' },
    });
  });

  it('한도 초과는 form과 안내 (같은 답을 다시 보낼 수 있다)', () => {
    const quota: InterviewToolOutput = { status: 'quota', message: { text: '오전 9시 이후에' }, stats };
    // 문자열 출력도 읽는다
    const messages = [userMsg(SUBMIT, 's1'), assistantMsg('s1', doneTool(INTERVIEW_TOOL, JSON.stringify(quota)))];
    expect(toInterviewViewState(viewInput({ messages, settlements: [settledSub('s1')] }))).toEqual({
      kind: 'form',
      alert: '오전 9시 이후에',
    });
  });

  it.each([
    ['도구 에러', [assistantMsg('s1', erroredTool(INTERVIEW_TOOL))], []],
    ['결과 없이 끝난 제출', [], [settledSub('s1', 'failed')]],
  ])('%s면 form과 실패 안내', (_, more, settlements) => {
    const messages = [userMsg(SUBMIT, 's1'), ...more];
    expect(toInterviewViewState(viewInput({ messages, settlements }))).toEqual({ kind: 'form', alert: INTERVIEW_ERROR });
  });

  it('끝나면 done과 요약, 그 뒤 메시지는 식단표 화면 몫', () => {
    const doneOut: InterviewToolOutput = {
      status: 'done',
      message: { text: '확인해 주세요' },
      summary: ['목표: 체중 감량'],
      result: resultA,
      stats,
    };
    const after = [userMsg('식단표 만들어 줘', 's2'), assistantMsg('s2', pendingTool('create_week_plan'))];
    const messages = [userMsg(SUBMIT, 's1'), assistantMsg('s1', out(doneOut)), ...after];

    expect(toInterviewViewState(viewInput({ messages, settlements: [settledSub('s1')] }))).toEqual({
      kind: 'done',
      message: { text: '확인해 주세요' },
      summary: ['목표: 체중 감량'],
      result: resultA,
      planMessages: after,
    });
  });
});
