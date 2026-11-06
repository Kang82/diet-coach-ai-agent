// 기간 선택: 일정 검증 (tasks.md B6 T5-3)
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { eventSlotOptions, validateEvents } from './period.ts';

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
