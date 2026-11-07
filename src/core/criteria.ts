// 스펙 2장 기준 테이블. 태그 제한 값은 2026-11-07 확정(열린 질문 1). 근거는 스펙 2장 표 아래.
import { CRITERION_IDS, GOAL_IDS, NUTRITION_TAGS } from './types.ts';
import type { CriteriaRules, CriterionId, GoalId, NutritionTag } from './types.ts';

interface GoalRule {
  criteria: CriterionId[];
  tagLimits: Partial<Record<NutritionTag, number>>;
}

export const CRITERIA_TABLE: Record<GoalId, GoalRule> = {
  weight_loss: {
    criteria: ['reduce_portion_calories'],
    tagLimits: { fried: 1, sugary: 1 },
  },
  blood_glucose: {
    criteria: ['reduce_refined_carbs', 'increase_fiber'],
    tagLimits: { refined_carb_main: 2, sugary: 0 },
  },
  cholesterol: {
    criteria: ['reduce_saturated_fat', 'increase_fiber'],
    tagLimits: { fried: 1, fatty_meat: 1, processed_meat: 0 },
  },
};

export function buildCriteria(goals: readonly GoalId[]): CriteriaRules {
  if (goals.length === 0) throw new Error('목표가 하나 이상 있어야 합니다.');

  const criteria = new Set<CriterionId>();
  const limits = new Map<NutritionTag, number>();

  for (const goal of new Set(goals)) {
    if (!GOAL_IDS.includes(goal)) throw new Error(`알 수 없는 목표: ${goal}`);
    const rule = CRITERIA_TABLE[goal];
    for (const c of rule.criteria) criteria.add(c);
    for (const [tag, max] of Object.entries(rule.tagLimits) as [NutritionTag, number][]) {
      const current = limits.get(tag);
      limits.set(tag, current === undefined ? max : Math.min(current, max));
    }
  }

  const tagLimits: Partial<Record<NutritionTag, number>> = {};
  for (const tag of NUTRITION_TAGS) {
    const max = limits.get(tag);
    if (max !== undefined) tagLimits[tag] = max;
  }

  return {
    criteria: CRITERION_IDS.filter((c) => criteria.has(c)),
    tagLimits,
  };
}
