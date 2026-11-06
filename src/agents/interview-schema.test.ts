// 인터뷰 제출과 목표 메모 확인 스키마 (스펙 4.1, tasks.md B4)
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { GoalNoteCheckSchema, parseInterviewSubmission, toGoalNoteCheck } from './interview-schema.ts';

describe('parseInterviewSubmission', () => {
  it('정상 제출', () => {
    const submission = {
      draft: {
        goals: ['weight_loss'],
        goalNote: '5kg',
        avoid: [],
        meals: [
          { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'others', menus: ['국밥'] },
          { dayType: 'weekend', meal: 'dinner', place: 'home', cookMinutes: null },
        ],
      },
      stopFlags: [],
    };
    expect(parseInterviewSubmission(submission)).toEqual(submission);
  });

  it('저장 동의는 true일 때만 남긴다 (B6)', () => {
    expect(parseInterviewSubmission({ draft: {}, stopFlags: [], consent: true })).toEqual({ draft: {}, stopFlags: [], consent: true });
    expect(parseInterviewSubmission({ draft: {}, stopFlags: [], consent: false })).toEqual({ draft: {}, stopFlags: [] });
    expect(parseInterviewSubmission({ draft: {}, stopFlags: [], consent: 'yes' })).toBeUndefined();
  });

  it.each([
    ['모르는 목표', { draft: { goals: ['muscle_gain'] }, stopFlags: [] }],
    ['모르는 필드', { draft: { userId: 'x' }, stopFlags: [] }],
    ['음수 조리 시간', { draft: { meals: [{ dayType: 'weekday', meal: 'dinner', cookMinutes: -5 }] }, stopFlags: [] }],
    ['stopFlags 없음', { draft: {} }],
    ['객체가 아님', '문자열'],
  ])('형식이 틀리면 undefined: %s', (_, json) => {
    expect(parseInterviewSubmission(json)).toBeUndefined();
  });
});

describe('GoalNoteCheckSchema', () => {
  it('null은 빈 배열로, 선택지는 다듬는다', () => {
    const raw = v.parse(GoalNoteCheckSchema, { stopFlags: null, turnFlags: ['extreme_restriction'], choices: [' 한 달에 2kg ', ''] });
    expect(toGoalNoteCheck(raw)).toEqual({ stopFlags: [], turnFlags: ['extreme_restriction'], choices: ['한 달에 2kg'] });
  });

  it('빠진 값도 받는다', () => {
    expect(toGoalNoteCheck(v.parse(GoalNoteCheckSchema, {}))).toEqual({ stopFlags: [], turnFlags: [], choices: [] });
  });

  it('모르는 플래그는 거절', () => {
    expect(v.safeParse(GoalNoteCheckSchema, { turnFlags: ['diabetes'] }).success).toBe(false);
  });
});
