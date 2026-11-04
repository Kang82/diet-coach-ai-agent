// 페르소나 A의 식단 기준 (감량 + 콜레스테롤).
// checkPlan 테스트가 buildCriteria 구현에 기대지 않도록 값을 그대로 적는다.
import type { CriteriaRules } from '../types.ts';

export const rulesA: CriteriaRules = {
  criteria: ['reduce_portion_calories', 'reduce_saturated_fat', 'increase_fiber'],
  tagLimits: { fried: 1, sugary: 1, fatty_meat: 1, processed_meat: 0 },
};
