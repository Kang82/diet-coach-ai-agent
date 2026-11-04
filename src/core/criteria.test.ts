// 스펙 8.3
import { describe, expect, it } from 'vitest';
import { buildCriteria } from './criteria.ts';
import type { GoalId } from './types.ts';

describe('buildCriteria', () => {
  it('1. 감량만', () => {
    expect(buildCriteria(['weight_loss'])).toEqual({
      criteria: ['reduce_portion_calories'],
      tagLimits: { fried: 1, sugary: 1 },
    });
  });

  it('2. 감량 + 콜레스테롤', () => {
    expect(buildCriteria(['weight_loss', 'cholesterol'])).toEqual({
      criteria: ['reduce_portion_calories', 'reduce_saturated_fat', 'increase_fiber'],
      tagLimits: { fried: 1, sugary: 1, fatty_meat: 1, processed_meat: 0 },
    });
  });

  it('3. 기준은 선언 순서이고 increase_fiber는 한 번만', () => {
    expect(buildCriteria(['cholesterol', 'blood_glucose']).criteria).toEqual([
      'reduce_refined_carbs',
      'reduce_saturated_fat',
      'increase_fiber',
    ]);
  });

  it('4. 같은 태그는 더 작은 제한을 쓴다', () => {
    expect(buildCriteria(['weight_loss', 'blood_glucose']).tagLimits.sugary).toBe(0);
  });

  it('5. 중복된 목표는 하나로 본다', () => {
    expect(buildCriteria(['weight_loss', 'weight_loss'])).toEqual(buildCriteria(['weight_loss']));
  });

  it('6. 목표가 비면 에러', () => {
    expect(() => buildCriteria([])).toThrow();
  });

  it('7. 알 수 없는 목표면 에러', () => {
    expect(() => buildCriteria(['muscle_gain' as GoalId])).toThrow();
  });
});
