// 프로필 확인 화면의 순수 로직 (tasks.md B6)
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { finishDraft, nextField, type InterviewResult } from './interview.ts';
import { criteriaText, draftFromResult, reopenSection } from './profile-edit.ts';
import type { InterviewState } from './types.ts';

const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
const resultA: InterviewResult = { goals, goalNote, medication, avoid, avoidNote, meals };
const lunch = { dayType: 'weekday', meal: 'lunch' } as const;
const dinner = { dayType: 'weekday', meal: 'dinner' } as const;

function doneState(): InterviewState {
  return { draft: draftFromResult(resultA), stopFlags: [], menuFollowUps: [lunch] };
}

describe('draftFromResult', () => {
  it('끝난 초안이 되고, 다시 마무리하면 같은 결과', () => {
    const draft = draftFromResult(resultA);
    expect(nextField(draft)).toBeNull();
    expect(finishDraft(draft)).toEqual(resultA);
  });

  it('조리 시간이 없는 집밥 끼니는 "상관없다"(null)', () => {
    const weekendLunch = draftFromResult(resultA).meals!.find((m) => m.dayType === 'weekend' && m.meal === 'lunch');
    expect(weekendLunch?.cookMinutes).toBeNull();
  });
});

describe('reopenSection', () => {
  it('목표: 목표, 메모, 약을 비우고 목표부터 다시 묻는다', () => {
    const state = reopenSection(doneState(), { kind: 'goals' });
    expect(state.draft.goals).toBeUndefined();
    expect(state.draft.goalNote).toBeUndefined();
    expect(state.draft.medication).toBeUndefined();
    expect(state.draft.avoid).toEqual(['dairy']);
    expect(nextField(state.draft)).toBe('goals');
  });

  it('약, 피할 음식은 그 단계만', () => {
    expect(nextField(reopenSection(doneState(), { kind: 'medication' }).draft)).toBe('medication');
    const avoidState = reopenSection(doneState(), { kind: 'avoid' });
    expect(avoidState.draft.avoidNote).toBeUndefined();
    expect(nextField(avoidState.draft)).toBe('avoid');
  });

  it('끼니 표: 끼니 전체와 메뉴 한 번 더 묻기 기록을 비운다', () => {
    const state = reopenSection(doneState(), { kind: 'meals' });
    expect(state.draft.meals).toBeUndefined();
    expect(state.menuFollowUps).toEqual([]);
    expect(nextField(state.draft)).toBe('meals');
  });

  it('끼니별 메뉴: 그 끼니 메뉴만 비우고 한 번 더 묻기 기록에서 뺀다', () => {
    const state = reopenSection(doneState(), { kind: 'menus', meal: lunch });
    expect(nextField(state.draft)).toEqual({ menusFor: lunch });
    expect(state.menuFollowUps).toEqual([]);
    expect(state.draft.meals?.find((m) => m.meal === 'lunch' && m.dayType === 'weekday')?.place).toBe('eat_out');
  });

  it('끼니별 조리 시간: 그 끼니만 다시 묻고, 원본은 그대로', () => {
    const before = doneState();
    const state = reopenSection(before, { kind: 'cookMinutes', meal: dinner });
    expect(nextField(state.draft)).toEqual({ cookMinutesFor: dinner });
    expect(nextField(before.draft)).toBeNull();
  });
});

describe('criteriaText', () => {
  it('페르소나 A 기준과 횟수 제한', () => {
    expect(criteriaText(rulesA)).toEqual({
      criteria: ['양과 열량 줄이기', '포화지방 줄이기', '식이섬유 늘리기'],
      limits: ['튀김: 주 1회까지', '기름진 고기: 주 1회까지', '햄·소시지 같은 가공육: 넣지 않음', '단 소스·디저트: 주 1회까지'],
    });
  });
});
