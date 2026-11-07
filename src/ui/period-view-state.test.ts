// 기간 선택 화면 상태 (tasks.md T9-6: 일정을 다 넣으면 입력 폼이 안내 없이 사라지던 문제)
import { describe, expect, it } from 'vitest';
import { profileA } from '../core/__fixtures__/persona-a.ts';
import { eventSlotOptions } from '../core/period.ts';
import { ALL_TAKEN_MESSAGE, NO_MEALS_LEFT_MESSAGE, periodFormState } from './period-view-state.ts';

const slots = eventSlotOptions(profileA.meals);
const withNote = (list: typeof slots) => list.map((s) => ({ ...s, note: '출장' }));

describe('periodFormState', () => {
  it('일정이 없으면 모든 끼니를 고를 수 있고 다음으로 갈 수 있다', () => {
    expect(periodFormState(profileA.meals, [])).toEqual({ options: slots, full: false, canNext: true, alert: undefined });
  });

  it('넣은 끼니는 고를 끼니에서 빠진다', () => {
    const state = periodFormState(profileA.meals, withNote(slots.slice(0, 2)));
    expect(state.options).toEqual(slots.slice(2));
    expect(state).toMatchObject({ full: false, canNext: true });
  });

  it('한 끼니만 남으면 폼이 남고 다음으로 갈 수 있다', () => {
    expect(periodFormState(profileA.meals, withNote(slots.slice(1)))).toMatchObject({
      options: [slots[0]],
      full: false,
      canNext: true,
      alert: undefined,
    });
  });

  it('모든 끼니에 일정을 넣으면 폼 대신 안내, 다음은 막고 이유를 알린다', () => {
    expect(periodFormState(profileA.meals, withNote(slots))).toEqual({
      options: [],
      full: true,
      canNext: false,
      alert: NO_MEALS_LEFT_MESSAGE,
    });
    expect(ALL_TAKEN_MESSAGE).toContain('일정을 빼면');
  });

  it('그 밖의 일정 문제는 다시 확인 안내', () => {
    const state = periodFormState(profileA.meals, [{ day: 'mon', meal: 'lunch', note: ' ' }]);
    expect(state).toMatchObject({ canNext: false, alert: '일정을 다시 확인해 주세요.' });
  });
});
