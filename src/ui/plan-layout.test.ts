import { describe, expect, it } from 'vitest';
import { planA } from '../core/__fixtures__/persona-a.ts';
import type { PlanCell } from '../core/types.ts';
import { layoutPlan } from './plan-layout.ts';

const cell = (day: PlanCell['day'], meal: PlanCell['meal']): PlanCell => ({
  ...planA.cells[0]!,
  day,
  meal,
  menuId: `${day}-${meal}`,
});

describe('layoutPlan', () => {
  it('끼니는 칸이 있는 것만 MEAL_TYPES 순서로, 요일은 7일 모두 DAYS 순서로', () => {
    const layout = layoutPlan({ weekStart: '2026-11-09', cells: [cell('tue', 'dinner'), cell('mon', 'lunch')] });

    expect(layout.meals).toEqual(['lunch', 'dinner']);
    expect(layout.days.map((d) => d.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(layout.days[0]!.cells.map((c) => c?.menuId)).toEqual(['mon-lunch', undefined]);
    expect(layout.days[1]!.cells.map((c) => c?.menuId)).toEqual([undefined, 'tue-dinner']);
    expect(layout.days[2]!.cells).toEqual([undefined, undefined]);
  });

  it('일정은 칸 대신 그 자리에 놓이고, 일정만 있는 끼니도 행이 된다 (B6)', () => {
    const layout = layoutPlan({
      weekStart: '2026-11-09',
      cells: [cell('mon', 'lunch')],
      events: [{ day: 'wed', meal: 'dinner', note: '회식' }],
    });
    expect(layout.meals).toEqual(['lunch', 'dinner']);
    expect(layout.days[2]!.events).toEqual([undefined, { day: 'wed', meal: 'dinner', note: '회식' }]);
    expect(layout.days[2]!.cells).toEqual([undefined, undefined]);
  });

  it('날짜는 weekStart부터 하루씩, 달이 바뀌어도 맞다', () => {
    const layout = layoutPlan({ weekStart: '2026-11-30', cells: [] });
    expect(layout.days.map((d) => d.date)).toEqual(['11/30', '12/1', '12/2', '12/3', '12/4', '12/5', '12/6']);
  });

  it('페르소나 A: 14칸이 모두 자리를 찾는다', () => {
    const layout = layoutPlan(planA);
    expect(layout.days.flatMap((d) => d.cells).filter(Boolean)).toHaveLength(planA.cells.length);
  });
});
