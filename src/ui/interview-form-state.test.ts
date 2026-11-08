// 인터뷰 화면의 진행 상태 (스펙 4.1, tasks.md B4)
import { describe, expect, it } from 'vitest';
import { avoidUpdate, cookMinutesUpdate, goalsUpdate, mealsUpdate, medicationUpdate, menusUpdate } from '../core/interview-form.ts';
import { profileA } from '../core/__fixtures__/persona-a.ts';
import {
  advance,
  progressFromResult,
  reopen,
  resolveProgress,
  restoreProgress,
  startProgress,
  stepDefaults,
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
    expect(stepDefaults(p)).toEqual({ menusText: meals.find((m) => m.dayType === 'weekday' && m.meal === 'lunch')!.menus!.join(', ') });
    expect(advance(p, menusUpdate(lunch, '국밥, 백반, 돈가스, 쌀국수, 회덮밥, 비빔밥')).previous).toBeUndefined();
  });

  it('고치기: 메뉴를 줄여 "메뉴가 적어요" 추가 질문이 나오면 입력란을 비운다. 지운 메뉴가 되살아나지 않게 (T19-4)', () => {
    const lunch = { dayType: 'weekday' as const, meal: 'lunch' as const };
    const p = advance(reopen(progressFromResult(resultA), { kind: 'menus', meal: lunch }), menusUpdate(lunch, '국밥'));
    expect(p.next).toMatchObject({ kind: 'ask', field: { menusFor: lunch }, reason: 'few_menus' });
    expect(stepDefaults(p)).toEqual({});
  });

  it('고치기: 목표를 고치면 목표부터', () => {
    expect(reopen(progressFromResult(resultA), { kind: 'goals' }).next).toEqual({ kind: 'ask', field: 'goals' });
  });
});

// T16: 고치기에서 이전 답을 채워 두고, 바꾼 것만 다시 묻는다
describe('고치기에서 이전 답 (T16)', () => {
  const lunch = { dayType: 'weekday' as const, meal: 'lunch' as const };
  const dinner = { dayType: 'weekday' as const, meal: 'dinner' as const };
  const weekendLunch = { dayType: 'weekend' as const, meal: 'lunch' as const };
  const rows = () => meals.map(({ dayType, meal, place, companions }) => ({ dayType, meal, place, companions }));
  const resultOf = (p: ReturnType<typeof advance>) => (p.next.kind === 'done' ? p.next.result : undefined);

  it('처음 인터뷰에는 이전 답이 없다', () => {
    expect(startProgress().previous).toBeUndefined();
    expect(stepDefaults(startProgress())).toEqual({});
  });

  it('목표: 이전 목표·메모를 채우고, 이어지는 복용약 단계도 이전 답을 준다', () => {
    const p = reopen(progressFromResult(resultA), { kind: 'goals' });
    expect(stepDefaults(p)).toEqual({ goals, goalNote });
    const med = advance(p, goalsUpdate({ goals, goalNote, stopFlags: [] }));
    expect(med.next).toEqual({ kind: 'ask', field: 'medication' });
    expect(stepDefaults(med)).toEqual({ medication });
    const done = advance(med, medicationUpdate(medication));
    expect(done.next.kind).toBe('done');
    expect(done.previous).toBeUndefined();
  });

  it('피할 음식: 이전 선택과 메모를 채운다', () => {
    const p = reopen(progressFromResult(resultA), { kind: 'avoid' });
    expect(stepDefaults(p)).toEqual({ avoid, avoidNote });
    expect(advance(p, avoidUpdate({ avoid, avoidNote })).next.kind).toBe('done');
  });

  it('조리 시간: 이전 답을 준다 (상관없음은 null)', () => {
    expect(stepDefaults(reopen(progressFromResult(resultA), { kind: 'cookMinutes', meal: dinner }))).toEqual({ cookMinutes: 20 });
    expect(stepDefaults(reopen(progressFromResult(resultA), { kind: 'cookMinutes', meal: weekendLunch }))).toEqual({ cookMinutes: null });
  });

  it('끼니: 6끼의 장소·같이 먹는 사람을 채우고, 그대로 답하면 메뉴·조리 시간을 다시 묻지 않고 확인 화면', () => {
    const p = reopen(progressFromResult(resultA), { kind: 'meals' });
    expect(stepDefaults(p)).toEqual({ meals: rows() });
    const done = advance(p, mealsUpdate(rows()));
    expect(done.next.kind).toBe('done');
    // 안 먹는 끼니의 같이 먹는 사람은 mealsUpdate가 원래 넣지 않는다. 이어 붙이는 것(메뉴·조리 시간)만 본다
    const details = (r: ReturnType<typeof resultOf>) => r?.meals.map(({ place, menus, cookMinutes }) => ({ place, menus, cookMinutes }));
    expect(details(resultOf(done))).toEqual(details(resultOf(progressFromResult(resultA))));
  });

  it('끼니: 장소를 바꾼 끼니만 다시 묻는다 (집밥 → 외식이면 그 끼니 메뉴만)', () => {
    const p = reopen(progressFromResult(resultA), { kind: 'meals' });
    const changed = rows().map((m) => (m.dayType === 'weekday' && m.meal === 'dinner' ? { ...m, place: 'eat_out' as const } : m));
    const asked = advance(p, mealsUpdate(changed));
    expect(asked.next).toEqual({ kind: 'ask', field: { menusFor: dinner } });
    const done = advance(asked, menusUpdate(dinner, '비빔밥, 칼국수, 쌀국수, 백반, 김밥'));
    expect(done.next.kind).toBe('done');
    const lunchAfter = resultOf(done)?.meals.find((m) => m.dayType === 'weekday' && m.meal === 'lunch');
    expect(lunchAfter?.menus).toEqual(meals.find((m) => m.dayType === 'weekday' && m.meal === 'lunch')!.menus);
  });

  it('저장된 진행에 previous가 없거나 예전 prefill이 있어도 복원된다', () => {
    const p = reopen(progressFromResult(resultA), { kind: 'avoid' });
    expect(restoreProgress(JSON.stringify(p))?.previous).toEqual(p.previous);
    const old = { state: p.state, next: p.next, prefill: '국밥' };
    expect(restoreProgress(JSON.stringify(old))?.state).toEqual(p.state);
    expect(stepDefaults(restoreProgress(JSON.stringify(old))!)).toEqual({});
  });

  void lunch;
});
