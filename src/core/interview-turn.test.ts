// 스펙 4.1 턴마다 코드가 하는 분기 1~7. 8.4
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { applyTurn, SUPPORTED_GOAL_CHOICES } from './interview-turn.ts';
import type { InterviewDraft, InterviewState, InterviewUpdate } from './types.ts';

const state = (draft: InterviewDraft = {}, more: Partial<InterviewState> = {}): InterviewState => ({
  draft,
  stopFlags: [],
  menuFollowUps: [],
  ...more,
});

const update = (more: Partial<InterviewUpdate> = {}): InterviewUpdate => ({
  filled: {},
  stopFlags: [],
  turnFlags: [],
  ...more,
});

/** 외식 메뉴만 남은 페르소나 A 초안 */
function beforeMenus(): InterviewDraft {
  const { goals, goalNote, medication, avoid, avoidNote } = structuredClone(profileA);
  const meals = structuredClone(profileA.meals).map((m) => {
    if (m.place === 'eat_out') return { ...m, menus: undefined };
    if (m.place === 'home' && m.cookMinutes === undefined) return { ...m, cookMinutes: null };
    return m;
  });
  return { goals, goalNote, medication, avoid, avoidNote, meals };
}

const LUNCH = { dayType: 'weekday', meal: 'lunch' } as const;
const lunchMenus = (menus: string[]): InterviewDraft => ({ meals: [{ ...LUNCH, menus }] });

describe('applyTurn', () => {
  it('답을 반영하고 다음 질문', () => {
    const result = applyTurn(state(), update({ filled: { goals: ['weight_loss'], goalNote: '5kg 감량' } }));
    expect(result.next).toEqual({ kind: 'ask', field: 'avoid' });
    expect(result.state.draft).toEqual({ goals: ['weight_loss'], goalNote: '5kg 감량' });
    expect(result.notices).toEqual([]);
  });

  describe('1. 중단', () => {
    it('stopFlags가 있으면 stop, 상태에 남는다', () => {
      const result = applyTurn(state(), update({ stopFlags: ['pregnancy'] }));
      expect(result.next).toEqual({ kind: 'stop', flags: ['pregnancy'] });
      expect(result.state.stopFlags).toEqual(['pregnancy']);
    });

    it('한 번 멈추면 다음 턴에도 stop', () => {
      const result = applyTurn(state({}, { stopFlags: ['kidney_disease'] }), update({ filled: { goals: ['weight_loss'] } }));
      expect(result.next).toEqual({ kind: 'stop', flags: ['kidney_disease'] });
    });

    it('medication이 "glucose"면 glucose_medication으로 멈춘다', () => {
      const result = applyTurn(state({ goals: ['blood_glucose'] }), update({ filled: { medication: 'glucose' } }));
      expect(result.next).toEqual({ kind: 'stop', flags: ['glucose_medication'] });
      expect(result.state.stopFlags).toEqual(['glucose_medication']);
    });

    it('플래그는 중복 없이 선언 순서로', () => {
      const result = applyTurn(
        state({}, { stopFlags: ['glucose_medication'] }),
        update({ stopFlags: ['glucose_medication', 'pregnancy'] }),
      );
      expect(result.state.stopFlags).toEqual(['pregnancy', 'glucose_medication']);
    });

    it('중단과 극단적 목표가 함께 오면 중단', () => {
      const result = applyTurn(state(), update({ stopFlags: ['pregnancy'], turnFlags: ['extreme_restriction'] }));
      expect(result.next.kind).toBe('stop');
    });
  });

  it('2. 극단적 목표: 이번 답은 버리고 같은 필드를 LLM 선택지로 다시 묻는다', () => {
    const result = applyTurn(
      state({ goals: ['weight_loss'], avoid: [] }),
      update({
        filled: { meals: [{ dayType: 'weekday', meal: 'breakfast', place: 'skip' }] },
        turnFlags: ['extreme_restriction'],
        ambiguous: { field: 'meals', choices: ['하루 세 끼, 양 줄이기', '아침은 가볍게'] },
      }),
    );
    expect(result.next).toEqual({
      kind: 'ask',
      field: 'meals',
      reason: 'extreme_restriction',
      choices: ['하루 세 끼, 양 줄이기', '아침은 가볍게'],
    });
    expect(result.state.draft).toEqual({ goals: ['weight_loss'], avoid: [] });
  });

  it('3. 미지원 목표: goals를 지원 목표 3개 중에서 다시 묻는다', () => {
    const result = applyTurn(
      state(),
      update({ filled: { goals: ['weight_loss'], avoid: [] }, turnFlags: ['unsupported_goal'] }),
    );
    expect(result.next).toEqual({
      kind: 'ask',
      field: 'goals',
      reason: 'unsupported_goal',
      choices: SUPPORTED_GOAL_CHOICES,
    });
    expect(SUPPORTED_GOAL_CHOICES).toEqual(['체중 감량', '혈당 관리', '콜레스테롤 관리']);
    expect(result.state.draft).toEqual({ avoid: [] });
  });

  it('4. 수치 해석·약 질문은 notices에 담고 인터뷰를 이어 간다', () => {
    const result = applyTurn(
      state({ goals: ['cholesterol'] }),
      update({
        filled: { medication: 'none' },
        turnFlags: ['asks_medication_advice', 'asks_lab_interpretation'],
      }),
    );
    expect(result.notices).toEqual(['asks_lab_interpretation', 'asks_medication_advice']);
    expect(result.next).toEqual({ kind: 'ask', field: 'avoid' });
  });

  describe('5. 모호한 답', () => {
    it('그 필드를 선택지와 함께 다시 묻고, 나머지 답은 반영한다', () => {
      const result = applyTurn(
        state(),
        update({
          filled: { goals: ['weight_loss'], avoid: ['dairy'] },
          ambiguous: { field: 'goals', choices: ['체중 감량', '혈당 관리'] },
        }),
      );
      expect(result.next).toEqual({ kind: 'ask', field: 'goals', reason: 'ambiguous', choices: ['체중 감량', '혈당 관리'] });
      expect(result.state.draft).toEqual({ avoid: ['dairy'] });
    });

    it('끼니 필드가 모호하면 그 끼니의 값만 빼고 반영한다', () => {
      const result = applyTurn(
        state(beforeMenus()),
        update({
          filled: { meals: [{ ...LUNCH, menus: ['국밥', '백반'], companions: 'family' }] },
          ambiguous: { field: { menusFor: LUNCH }, choices: ['구내식당', '근처 식당'] },
        }),
      );
      expect(result.next).toEqual({
        kind: 'ask',
        field: { menusFor: LUNCH },
        reason: 'ambiguous',
        choices: ['구내식당', '근처 식당'],
      });
      const lunch = result.state.draft.meals!.find((m) => m.meal === 'lunch' && m.dayType === 'weekday');
      expect(lunch?.menus).toBeUndefined();
      expect(lunch?.companions).toBe('family');
    });
  });

  describe('6. 외식 메뉴 부족', () => {
    it('2개 이하면 한 번 더 묻고 기억한다', () => {
      const result = applyTurn(state(beforeMenus()), update({ filled: lunchMenus(['국밥', '백반']) }));
      expect(result.next).toEqual({ kind: 'ask', field: { menusFor: LUNCH }, reason: 'few_menus' });
      expect(result.state.menuFollowUps).toEqual([LUNCH]);
      expect(result.state.draft.meals![1]!.menus).toEqual(['국밥', '백반']);
    });

    it('두 번째에도 2개 이하면(거절) 그대로 진행한다', () => {
      const first = applyTurn(state(beforeMenus()), update({ filled: lunchMenus(['국밥', '백반']) }));
      const second = applyTurn(first.state, update({ filled: {} }));
      expect(second.next.kind).toBe('done');
    });

    it('3개 이상이면 묻지 않는다', () => {
      const result = applyTurn(state(beforeMenus()), update({ filled: lunchMenus(['국밥', '백반', '쌀국수']) }));
      expect(result.next.kind).toBe('done');
      expect(result.state.menuFollowUps).toEqual([]);
    });
  });

  it('7. 마지막 답이면 done: 프로필 항목과 식단 기준', () => {
    const result = applyTurn(
      state(beforeMenus()),
      update({ filled: lunchMenus(['국밥', '백반', '돈가스', '쌀국수', '회덮밥']) }),
    );
    const { userId: _u, version: _v, consentedAt: _c, updatedAt: _t, ...expected } = profileA;
    expect(result.next).toEqual({
      kind: 'done',
      result: expected,
      criteria: {
        criteria: ['reduce_portion_calories', 'reduce_saturated_fat', 'increase_fiber'],
        tagLimits: { fried: 1, sugary: 1, fatty_meat: 1, processed_meat: 0 },
      },
    });
  });

  it('입력 상태를 바꾸지 않는다', () => {
    const before = state(beforeMenus());
    const copy = structuredClone(before);
    applyTurn(before, update({ filled: lunchMenus(['국밥']) }));
    expect(before).toEqual(copy);
  });
});
