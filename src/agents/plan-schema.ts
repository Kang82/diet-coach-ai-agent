// 스펙 1.4 PlanCell의 valibot 스키마. LLM 출력(Flue finish 도구의 인자)을 검증한다.
// 형식만 본다. 메뉴 목록, 피할 음식, 횟수 같은 규칙은 스키마가 아니라 checkPlan이 판정한다.
// 규칙까지 스키마에 넣으면 Flue가 스키마 재요청으로 같은 일을 반복해 Neuron을 더 쓴다.
import * as v from 'valibot';
import { AVOID_TAGS, CRITERION_IDS, DAYS, MEAL_TYPES, NUTRITION_TAGS } from '../core/types.ts';

export const PlanCellSchema = v.object({
  day: v.picklist(DAYS),
  meal: v.picklist(MEAL_TYPES),
  place: v.picklist(['eat_out', 'home']),
  menuId: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  ingredients: v.array(v.string()),
  tags: v.array(v.picklist([...AVOID_TAGS, ...NUTRITION_TAGS])),
  orderTip: v.optional(v.string()),
  cookMinutes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  reason: v.pipe(v.string(), v.minLength(1)),
  criterionIds: v.array(v.picklist(CRITERION_IDS)),
});

/** finish 도구의 인자는 객체여야 해서 배열을 cells로 감싼다. */
export const PlanCellsResultSchema = v.object({
  cells: v.array(PlanCellSchema),
});
