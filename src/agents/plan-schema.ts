// 스펙 1.4 PlanCell의 valibot 스키마. LLM 출력(Flue finish 도구의 인자)을 검증한다.
// 형식만 본다. 메뉴 목록, 피할 음식, 횟수 같은 규칙은 스키마가 아니라 checkPlan이 판정한다.
// 규칙까지 스키마에 넣으면 Flue가 스키마 재요청으로 같은 일을 반복해 Neuron을 더 쓴다.
import * as v from 'valibot';
import { AVOID_TAGS, CRITERION_IDS, DAYS, MEAL_TYPES, NUTRITION_TAGS, type PlanCell } from '../core/types.ts';

// 받아 줄 수 있는 모양은 받는다 (menu-schema.ts와 같음, tasks.md "나중에" 2026-11-08). 검증에 실패하면 Flue가 다시 요청한다
// - 값이 하나면 배열 대신 문자열로 낸다 (gemma가 메뉴 분류에서 그랬다, B6)
// - 빈 값을 null로 내거나 뺀다
const oneOrMany = <T extends v.GenericSchema<string>>(item: T) => v.nullish(v.union([v.array(item), item]));

export const PlanCellSchema = v.object({
  day: v.picklist(DAYS),
  meal: v.picklist(MEAL_TYPES),
  place: v.picklist(['eat_out', 'home']),
  menuId: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  ingredients: oneOrMany(v.string()),
  tags: oneOrMany(v.picklist([...AVOID_TAGS, ...NUTRITION_TAGS])),
  orderTip: v.nullish(v.string()),
  cookMinutes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  reason: v.pipe(v.string(), v.minLength(1)),
  criterionIds: oneOrMany(v.picklist(CRITERION_IDS)),
  // 집밥 칸의 주재료 (T18). 외식은 비워도 된다
  mainIngredient: v.nullish(v.string()),
});

/** finish 도구의 인자는 객체여야 해서 배열을 cells로 감싼다. */
export const PlanCellsResultSchema = v.object({
  cells: v.array(PlanCellSchema),
});

export type RawPlanCell = v.InferOutput<typeof PlanCellSchema>;

/** 스키마가 받아 준 모양을 PlanCell로 맞춘다: 배열 필드는 배열로, null orderTip과 null·빈 mainIngredient는 없앤다 */
export function toPlanCells(raw: { cells: RawPlanCell[] }): PlanCell[] {
  return raw.cells.map(({ ingredients, tags, criterionIds, orderTip, mainIngredient, ...rest }) => ({
    ...rest,
    ingredients: toArray(ingredients),
    tags: toArray(tags),
    criterionIds: toArray(criterionIds),
    ...(orderTip === null || orderTip === undefined ? {} : { orderTip }),
    ...(mainIngredient?.trim() ? { mainIngredient } : {}),
  }));
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value];
}
