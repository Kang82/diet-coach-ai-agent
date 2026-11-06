// 인터뷰 제출 (스펙 4.1, tasks.md B4). 가짜 메모 확인기로 확인한다.
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { avoidUpdate, cookMinutesUpdate, goalsUpdate, mealsUpdate, medicationUpdate, menusUpdate } from './interview-form.ts';
import type { GoalNoteCheck, GoalNoteInput } from './interview-note.ts';
import { submitInterview, type GoalNoteChecker } from './interview-runner.ts';
import { questionText } from './interview-text.ts';
import { mergeDraft } from './interview.ts';
import { QUOTA_EXCEEDED_MESSAGE, QuotaExceededError } from './quota.ts';
import type { InterviewDraft } from './types.ts';

const USAGE = { model: 'fake', input: 10, output: 20 };

function fakeChecker(reply: Partial<GoalNoteCheck> | Error) {
  const calls: GoalNoteInput[] = [];
  const checker: GoalNoteChecker = {
    async check(input) {
      calls.push(structuredClone(input));
      if (reply instanceof Error) throw reply;
      return { value: { stopFlags: [], turnFlags: [], choices: [], ...reply }, usage: USAGE };
    },
  };
  return { checker, calls };
}

/** 화면에서 끝낸 페르소나 A 초안 */
function draftA(goalNote = profileA.goalNote): InterviewDraft {
  const updates = [
    goalsUpdate({ goals: profileA.goals, goalNote, stopFlags: [] }),
    medicationUpdate('none'),
    avoidUpdate({ avoid: profileA.avoid, avoidNote: profileA.avoidNote }),
    mealsUpdate(profileA.meals),
    menusUpdate({ dayType: 'weekday', meal: 'lunch' }, '국밥, 백반, 돈가스, 쌀국수, 회덮밥'),
    cookMinutesUpdate({ dayType: 'weekday', meal: 'dinner' }, 20),
    cookMinutesUpdate({ dayType: 'weekend', meal: 'lunch' }, null),
    cookMinutesUpdate({ dayType: 'weekend', meal: 'dinner' }, null),
  ];
  return updates.reduce<InterviewDraft>((draft, u) => mergeDraft(draft, u.filled), {});
}

describe('submitInterview', () => {
  it('메모가 없으면 확인기를 부르지 않고 done', async () => {
    const { checker, calls } = fakeChecker({});
    const out = await submitInterview(checker, { draft: draftA(''), stopFlags: [] });
    expect(calls).toEqual([]);
    expect(out.kind).toBe('done');
    expect(out.usages).toEqual([]);
  });

  it('메모가 있으면 한 번 확인하고 done과 요약', async () => {
    const { checker, calls } = fakeChecker({});
    const out = await submitInterview(checker, { draft: draftA(), stopFlags: [] });
    expect(calls).toEqual([{ goals: profileA.goals, note: profileA.goalNote }]);
    expect(out.kind).toBe('done');
    if (out.kind !== 'done') return;
    expect(out.result.goals).toEqual(profileA.goals);
    expect(out.summary[0]).toContain('체중 감량, 콜레스테롤 관리');
    expect(out.usages).toEqual([USAGE]);
  });

  it('무리한 목표면 목표를 다시 묻고 LLM 선택지를 준다', async () => {
    const { checker } = fakeChecker({ turnFlags: ['extreme_restriction'], choices: ['한 달에 2kg 감량'] });
    const out = await submitInterview(checker, { draft: draftA('한 달에 10kg'), stopFlags: [] });
    expect(out).toMatchObject({
      kind: 'ask',
      next: { kind: 'ask', field: 'goals', reason: 'extreme_restriction', choices: ['한 달에 2kg 감량'] },
      message: { choices: ['한 달에 2kg 감량'] },
    });
    if (out.kind === 'ask') expect(out.message.text).toContain(questionText('goals'));
  });

  it('지원하지 않는 목표면 지원 목표 3개', async () => {
    const { checker } = fakeChecker({ turnFlags: ['unsupported_goal'] });
    const out = await submitInterview(checker, { draft: draftA('근육 키우기'), stopFlags: [] });
    expect(out).toMatchObject({ kind: 'ask', next: { reason: 'unsupported_goal', choices: ['체중 감량', '혈당 관리', '콜레스테롤 관리'] } });
  });

  it('메모에서 중단 사유가 나오면 stop', async () => {
    const { checker } = fakeChecker({ stopFlags: ['pregnancy'] });
    const out = await submitInterview(checker, { draft: draftA('임신 중이에요'), stopFlags: [] });
    expect(out.kind).toBe('stop');
    expect(out.message.text).toContain('임신');
  });

  it('범위 밖 질문은 안내를 덧붙이고 done', async () => {
    const { checker } = fakeChecker({ turnFlags: ['asks_lab_interpretation'] });
    const out = await submitInterview(checker, { draft: draftA('LDL 160이면 높은가요?'), stopFlags: [] });
    expect(out.kind).toBe('done');
    expect(out.message.text).toContain('검사 수치');
  });

  it('한도 초과면 quota', async () => {
    const { checker } = fakeChecker(new QuotaExceededError());
    const out = await submitInterview(checker, { draft: draftA(), stopFlags: [] });
    expect(out).toEqual({ kind: 'quota', message: { text: QUOTA_EXCEEDED_MESSAGE }, usages: [] });
  });

  it('다른 에러는 그대로 던진다', async () => {
    const error = new Error('boom');
    const { checker } = fakeChecker(error);
    await expect(submitInterview(checker, { draft: draftA(), stopFlags: [] })).rejects.toBe(error);
  });

  it('끝나지 않은 초안이면 에러', async () => {
    const { checker } = fakeChecker({});
    await expect(submitInterview(checker, { draft: { goals: ['weight_loss'] }, stopFlags: [] })).rejects.toThrow();
  });
});
