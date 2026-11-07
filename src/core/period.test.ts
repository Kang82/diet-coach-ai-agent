// 기간 선택: 일정 검증 (tasks.md B6 T5-3)
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { nextMondayKst } from './helpers.ts';
import { eventSlotOptions, planWeekStart, validateEvents } from './period.ts';

describe('eventSlotOptions', () => {
  it('페르소나 A: 평일 점심·저녁, 주말 점심·저녁 (아침은 안 먹음)', () => {
    const slots = eventSlotOptions(profileA.meals);
    expect(slots).toHaveLength(14);
    expect(slots[0]).toEqual({ day: 'mon', meal: 'lunch' });
    expect(slots.some((s) => s.meal === 'breakfast')).toBe(false);
  });
});

describe('validateEvents', () => {
  it('메모를 정리하고 시간순으로', () => {
    expect(
      validateEvents(profileA.meals, [
        { day: 'fri', meal: 'dinner', note: '  팀   회식 ' },
        { day: 'wed', meal: 'lunch', note: '거래처 약속' },
      ]),
    ).toEqual({
      events: [
        { day: 'wed', meal: 'lunch', note: '거래처 약속' },
        { day: 'fri', meal: 'dinner', note: '팀 회식' },
      ],
      issues: [],
    });
  });

  it('안 먹는 끼니, 같은 칸 두 번, 빈 메모, 긴 메모', () => {
    const { issues } = validateEvents(profileA.meals, [
      { day: 'mon', meal: 'breakfast', note: '조찬' },
      { day: 'tue', meal: 'dinner', note: '회식' },
      { day: 'tue', meal: 'dinner', note: '또 회식' },
      { day: 'wed', meal: 'dinner', note: '  ' },
      { day: 'thu', meal: 'dinner', note: '가'.repeat(51) },
    ]);
    expect(issues).toEqual([
      { code: 'not_meal', slot: { day: 'mon', meal: 'breakfast' } },
      { code: 'duplicate', slot: { day: 'tue', meal: 'dinner' } },
      { code: 'empty_note', slot: { day: 'wed', meal: 'dinner' } },
      { code: 'too_long', slot: { day: 'thu', meal: 'dinner' } },
    ]);
  });
});

describe('validateEvents: 식단표로 짤 끼니가 남아야 한다 (T9-6)', () => {
  it('모든 끼니가 일정이면 no_meals_left', () => {
    const all = eventSlotOptions(profileA.meals).map((s) => ({ ...s, note: '출장' }));
    expect(validateEvents(profileA.meals, all).issues).toEqual([{ code: 'no_meals_left' }]);
  });

  it('한 끼니라도 남으면 문제없다', () => {
    const allButOne = eventSlotOptions(profileA.meals).slice(1).map((s) => ({ ...s, note: '출장' }));
    expect(validateEvents(profileA.meals, allButOne).issues).toEqual([]);
  });
});

// T9-4: 시작일은 분류할 때 정해 두지만, 만들 때 그 주가 이미 시작했으면 다음 주로 다시 정한다
describe('planWeekStart', () => {
  it('일요일 밤에 분류(다음 날 월요일), 월요일에 만들면 그다음 월요일', () => {
    const saved = nextMondayKst(new Date('2026-11-08T23:00:00+09:00')); // 일요일 밤
    expect(saved).toBe('2026-11-09');
    expect(planWeekStart(saved, new Date('2026-11-09T10:00:00+09:00'))).toBe('2026-11-16');
  });

  it('아직 시작하지 않은 주면 저장한 날 그대로', () => {
    expect(planWeekStart('2026-11-09', new Date('2026-11-07T10:00:00+09:00'))).toBe('2026-11-09');
    expect(planWeekStart('2026-11-09', new Date('2026-11-08T23:59:59+09:00'))).toBe('2026-11-09');
  });

  it('한국 시각 기준: 월요일 0시 KST(일요일 15시 UTC)면 이미 시작한 주', () => {
    expect(planWeekStart('2026-11-09', new Date('2026-11-08T15:00:00Z'))).toBe('2026-11-16');
  });

  it('저장한 값이 없으면 다음 월요일', () => {
    expect(planWeekStart(undefined, new Date('2026-11-07T10:00:00+09:00'))).toBe('2026-11-09');
  });
});
