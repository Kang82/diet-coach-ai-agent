// 스펙 1.3, 4.2 메뉴 분류 LLM 출력(Flue finish 도구의 인자)의 valibot 스키마 (tasks.md B5).
// 대상 목록과 1:1인지도 스키마에서 본다. 맞지 않으면 Flue가 이 메시지를 모델에 돌려주고 다시 요청한다
// (스펙 4.2 "빠지거나 추가되면 형식 오류로 보고 다시 요청한다"). JSON 스키마 변환은 check를 건너뛴다(errorMode: 'ignore').
// 이번 기준에 없는 criterionIds는 여기서 막지 않고 코드가 지운다(normalizeClassifications).
import * as v from 'valibot';
import { checkClassification, describeIssues } from '../core/menu-classification.ts';
import { CRITERION_IDS, MENU_CLASSES, type MenuClassification } from '../core/types.ts';

// 모델이 빈 값을 null로 내는 경우가 많아 배열은 nullish로 받는다 (interview-schema.ts와 같음)
const ClassificationSchema = v.object({
  menu: v.string(),
  class: v.picklist(MENU_CLASSES),
  reason: v.string(),
  criterionIds: v.nullish(v.array(v.picklist(CRITERION_IDS))),
  orderTips: v.nullish(v.array(v.string())),
});

type RawClassification = v.InferOutput<typeof ClassificationSchema>;

export function menuClassesSchema(targets: readonly string[]) {
  return v.pipe(
    v.object({ classes: v.array(ClassificationSchema) }),
    v.check(
      (out) => checkClassification(targets, out.classes).length === 0,
      (issue) => describeIssues(checkClassification(targets, (issue.input as { classes: RawClassification[] }).classes)),
    ),
  );
}

export type MenuClassesOutput = { classes: RawClassification[] };

export function toMenuClassifications(raw: MenuClassesOutput): MenuClassification[] {
  return raw.classes.map((c) => ({
    menu: c.menu,
    class: c.class,
    reason: c.reason,
    criterionIds: [...(c.criterionIds ?? [])],
    orderTips: [...(c.orderTips ?? [])],
  }));
}
