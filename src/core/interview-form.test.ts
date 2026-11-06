// 인터뷰 화면 입력 → InterviewUpdate (스펙 4.1, tasks.md B4). 화면에서 단계마다 applyTurn을 돌린다.
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import {
  avoidUpdate,
  cookMinutesUpdate,
  formatInterviewSubmission,
  goalsUpdate,
  isInterviewSubmission,
  mealsUpdate,
  medicationUpdate,
  menusUpdate,
  parseMenus,
  submissionJson,
} from './interview-form.ts';
import { EMPTY_INTERVIEW } from './interview-runner.ts';
import { applyTurn, type TurnNext } from './interview-turn.ts';
import type { InterviewState, InterviewUpdate, MealKey } from './types.ts';

const LUNCH: MealKey = { dayType: 'weekday', meal: 'lunch' };

describe('parseMenus', () => {
  it('쉼표·줄바꿈·가운뎃점으로 나누고 공백과 빈 값을 정리한다', () => {
    expect(parseMenus(' 국밥, 백반\n돈가스 · 쌀국수,, ')).toEqual(['국밥', '백반', '돈가스', '쌀국수']);
  });

  it('공백만 다른 메뉴는 하나로', () => {
    expect(parseMenus('회덮밥, 회 덮밥, 국밥')).toEqual(['회덮밥', '국밥']);
  });
});

describe('단계 입력 → update', () => {
  it('목표: 메모는 다듬고, 중단 사유는 stopFlags로', () => {
    expect(goalsUpdate({ goals: ['cholesterol', 'weight_loss'], goalNote: ' 5kg 감량 ', stopFlags: ['pregnancy'] })).toEqual({
      filled: { goals: ['weight_loss', 'cholesterol'], goalNote: '5kg 감량' },
      stopFlags: ['pregnancy'],
      turnFlags: [],
    });
  });

  it('약', () => {
    expect(medicationUpdate('none').filled).toEqual({ medication: 'none' });
  });

  it('피할 음식 없음은 avoid: []', () => {
    expect(avoidUpdate({ avoid: [], avoidNote: '' }).filled).toEqual({ avoid: [], avoidNote: '' });
  });

  it('끼니: 안 먹는 끼니는 같이 먹는 사람을 넣지 않는다', () => {
    const update = mealsUpdate([
      { dayType: 'weekday', meal: 'breakfast', place: 'skip', companions: 'family' },
      { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'others' },
    ]);
    expect(update.filled.meals).toEqual([
      { dayType: 'weekday', meal: 'breakfast', place: 'skip' },
      { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'others' },
    ]);
  });

  it('메뉴: 이미 받은 메뉴와 합친다 (한 번 더 물었을 때)', () => {
    expect(menusUpdate(LUNCH, '쌀국수, 국밥', ['국밥']).filled.meals).toEqual([{ ...LUNCH, menus: ['국밥', '쌀국수'] }]);
  });

  it('조리 시간: 상관없음은 null', () => {
    const key: MealKey = { dayType: 'weekend', meal: 'dinner' };
    expect(cookMinutesUpdate(key, null).filled.meals).toEqual([{ ...key, cookMinutes: null }]);
    expect(cookMinutesUpdate(key, 20).filled.meals).toEqual([{ ...key, cookMinutes: 20 }]);
  });
});

/** 지금 질문에 맞춰 페르소나 A의 답을 낸다 */
function answerA(next: Extract<TurnNext, { kind: 'ask' }>, state: InterviewState): InterviewUpdate {
  const field = next.field;
  if (field === 'goals') return goalsUpdate({ goals: profileA.goals, goalNote: profileA.goalNote, stopFlags: [] });
  if (field === 'medication') return medicationUpdate(profileA.medication);
  if (field === 'avoid') return avoidUpdate({ avoid: profileA.avoid, avoidNote: profileA.avoidNote });
  if (field === 'meals') return mealsUpdate(profileA.meals);
  const key = 'menusFor' in field ? field.menusFor : field.cookMinutesFor;
  const setting = profileA.meals.find((m) => m.dayType === key.dayType && m.meal === key.meal)!;
  if ('menusFor' in field) {
    const existing = state.draft.meals?.find((m) => m.dayType === key.dayType && m.meal === key.meal)?.menus;
    return menusUpdate(key, setting.menus!.join(', '), existing);
  }
  return cookMinutesUpdate(key, setting.cookMinutes ?? null);
}

describe('페르소나 A로 끝까지', () => {
  it('done 결과가 profileA의 인터뷰 항목과 같다', () => {
    let state = EMPTY_INTERVIEW;
    let next: TurnNext = { kind: 'ask', field: 'goals' };
    for (let i = 0; i < 20 && next.kind === 'ask'; i++) ({ state, next } = applyTurn(state, answerA(next, state)));

    expect(next.kind).toBe('done');
    if (next.kind !== 'done') return;
    const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
    // 안 먹는 끼니는 같이 먹는 사람을 묻지 않아 기본값 alone이 된다 (픽스처의 주말 아침은 family)
    const expectedMeals = meals.map((m) => (m.place === 'skip' ? { ...m, companions: 'alone' } : m));
    expect(next.result).toEqual({ goals, goalNote, medication, avoid, avoidNote, meals: expectedMeals });
  });

  it('메뉴가 2개면 한 번 더 묻고, "더 없음"이면 그대로 진행한다', () => {
    const base: InterviewState = {
      ...EMPTY_INTERVIEW,
      draft: { goals: ['weight_loss'], avoid: [], meals: mealsUpdate(profileA.meals).filled.meals },
    };
    const first = applyTurn(base, menusUpdate(LUNCH, '국밥, 백반'));
    expect(first.next).toEqual({ kind: 'ask', field: { menusFor: LUNCH }, reason: 'few_menus' });

    const second = applyTurn(first.state, { filled: {}, stopFlags: [], turnFlags: [] });
    expect(second.next).toMatchObject({ kind: 'ask', field: { cookMinutesFor: { dayType: 'weekday', meal: 'dinner' } } });
  });

  it('당뇨약이면 stop', () => {
    const state: InterviewState = { ...EMPTY_INTERVIEW, draft: { goals: ['blood_glucose'] } };
    expect(applyTurn(state, medicationUpdate('glucose')).next).toEqual({ kind: 'stop', flags: ['glucose_medication'] });
  });

  it('중단 사유 체크박스면 stop', () => {
    const update = goalsUpdate({ goals: ['weight_loss'], goalNote: '', stopFlags: ['kidney_disease'] });
    expect(applyTurn(EMPTY_INTERVIEW, update).next).toEqual({ kind: 'stop', flags: ['kidney_disease'] });
  });
});

describe('제출 메시지', () => {
  it('왕복', () => {
    const submission = { draft: { goals: ['weight_loss' as const], avoid: [] }, stopFlags: [] };
    const body = formatInterviewSubmission(submission);
    expect(isInterviewSubmission(body)).toBe(true);
    expect(submissionJson(body)).toEqual(submission);
  });

  it('형식이 아니면 undefined', () => {
    expect(isInterviewSubmission('식단표 만들어 줘')).toBe(false);
    expect(submissionJson('식단표 만들어 줘')).toBeUndefined();
    expect(submissionJson('인터뷰 제출:\n{깨진 JSON')).toBeUndefined();
  });
});
