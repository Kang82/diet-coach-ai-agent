// 인터뷰 화면의 진행 상태 (스펙 4.1, tasks.md B4)
import { describe, expect, it } from 'vitest';
import { cookMinutesUpdate, goalsUpdate, medicationUpdate } from '../core/interview-form.ts';
import { profileA } from '../core/__fixtures__/persona-a.ts';
import {
  advance,
  progressFromResult,
  reopen,
  resolveProgress,
  restoreProgress,
  startProgress,
  type ServerAsk,
} from './interview-form-state.ts';

const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
const resultA = { goals, goalNote, medication, avoid, avoidNote, meals };

const stats = { seconds: 3, usages: [], neurons: 20 };
const serverAsk = (id: string): ServerAsk => ({
  id,
  output: {
    status: 'ask',
    message: { text: '무리하지 않는 목표로', choices: ['한 달에 2kg 감량'] },
    state: { draft: { goals: ['weight_loss'], goalNote: '한 달에 10kg' }, stopFlags: [], menuFollowUps: [] },
    next: { kind: 'ask', field: 'goals', reason: 'extreme_restriction', choices: ['한 달에 2kg 감량'] },
    stats,
  },
});

describe('advance', () => {
  it('답을 반영하고 다음 단계. 그냥 다음 질문이면 안내는 없다', () => {
    const p = advance(startProgress(), goalsUpdate({ goals: ['cholesterol'], goalNote: '', stopFlags: [] }));
    expect(p.next).toEqual({ kind: 'ask', field: 'medication' });
    expect(p.message).toBeUndefined();
  });

  it('중단이면 안내가 붙는다', () => {
    const start = advance(startProgress(), goalsUpdate({ goals: ['blood_glucose'], goalNote: '', stopFlags: [] }));
    const p = advance(start, medicationUpdate('glucose'));
    expect(p.next.kind).toBe('stop');
    expect(p.message?.text).toContain('혈당약');
  });

  it('이어받은 서버 ask를 기억한다', () => {
    const p = advance({ ...startProgress(), basedOn: 'call-1' }, goalsUpdate({ goals: ['weight_loss'], goalNote: '', stopFlags: [] }));
    expect(p.basedOn).toBe('call-1');
  });
});

describe('resolveProgress', () => {
  it('저장된 것도 서버 ask도 없으면 처음부터', () => {
    expect(resolveProgress(null, undefined)).toEqual(startProgress());
    expect(startProgress().next).toEqual({ kind: 'ask', field: 'goals' });
  });

  it('저장된 진행을 복원한다', () => {
    const p = advance(startProgress(), goalsUpdate({ goals: ['weight_loss'], goalNote: '', stopFlags: [] }));
    expect(resolveProgress(JSON.stringify(p), undefined)).toEqual(p);
  });

  it('새 서버 ask면 그 상태에서 이어 간다', () => {
    const p = resolveProgress(JSON.stringify(startProgress()), serverAsk('call-1'));
    expect(p).toEqual({
      state: serverAsk('call-1').output.state,
      next: serverAsk('call-1').output.next,
      message: serverAsk('call-1').output.message,
      basedOn: 'call-1',
    });
  });

  it('이미 이어받은 서버 ask면 저장된 진행을 쓴다', () => {
    const saved = advance({ ...startProgress(), basedOn: 'call-1' }, goalsUpdate({ goals: ['weight_loss'], goalNote: '', stopFlags: [] }));
    expect(resolveProgress(JSON.stringify(saved), serverAsk('call-1'))).toEqual(saved);
  });
});

describe('restoreProgress', () => {
  it.each([['빈 값', ''], ['깨진 JSON', '{'], ['모양이 다름', '{"state":{},"next":{"kind":"ask"}}'], ['모르는 kind', JSON.stringify({ ...startProgress(), next: { kind: 'x' } })]])(
    '%s면 undefined',
    (_, raw) => {
      expect(restoreProgress(raw)).toBeUndefined();
    },
  );

  it('정상 값', () => {
    expect(restoreProgress(JSON.stringify(startProgress()))).toEqual(startProgress());
  });
});

describe('프로필 확인 화면 (B6)', () => {
  it('저장된 결과로 시작하면 끝난 진행(done)이고 결과가 같다', () => {
    const p = progressFromResult(resultA);
    expect(p.next.kind).toBe('done');
    expect(p.next.kind === 'done' && p.next.result).toEqual(resultA);
    expect(p.message).toBeUndefined();
  });

  it('고치기: 그 단계를 다시 묻고, 다 답하면 다시 done', () => {
    const p = reopen(progressFromResult(resultA), { kind: 'cookMinutes', meal: { dayType: 'weekday', meal: 'dinner' } });
    expect(p.next).toEqual({ kind: 'ask', field: { cookMinutesFor: { dayType: 'weekday', meal: 'dinner' } } });
    const answered = advance(p, cookMinutesUpdate({ dayType: 'weekday', meal: 'dinner' }, 30));
    expect(answered.next.kind).toBe('done');
    const dinner = answered.next.kind === 'done' ? answered.next.result.meals.find((m) => m.meal === 'dinner' && m.dayType === 'weekday') : undefined;
    expect(dinner?.cookMinutes).toBe(30);
  });

  it('고치기: 메뉴를 고치면 이전 메뉴를 입력란에 미리 채우고, 답하면 없어진다 (B16)', () => {
    const lunch = { dayType: 'weekday' as const, meal: 'lunch' as const };
    const p = reopen(progressFromResult(resultA), { kind: 'menus', meal: lunch });
    expect(p.next).toEqual({ kind: 'ask', field: { menusFor: lunch } });
    expect(p.prefill).toBe(meals.find((m) => m.dayType === 'weekday' && m.meal === 'lunch')!.menus!.join(', '));
    expect(advance(p, { filled: {}, stopFlags: [], turnFlags: [] }).prefill).toBeUndefined();
    expect(reopen(progressFromResult(resultA), { kind: 'goals' }).prefill).toBeUndefined();
  });

  it('고치기: 목표를 고치면 목표부터', () => {
    expect(reopen(progressFromResult(resultA), { kind: 'goals' }).next).toEqual({ kind: 'ask', field: 'goals' });
  });
});
