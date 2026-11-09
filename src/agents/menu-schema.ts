// 스펙 1.3, 4.2 메뉴 분류 LLM 출력(Flue finish 도구의 인자)의 valibot 스키마 (tasks.md B5).
// 대상 목록과 1:1인지도 스키마에서 본다. 맞지 않으면 Flue가 이 메시지를 모델에 돌려주고 다시 요청한다
// (스펙 4.2 "빠지거나 추가되면 형식 오류로 보고 다시 요청한다"). JSON 스키마 변환은 check를 건너뛴다(errorMode: 'ignore').
// 이번 기준에 없는 criterionIds는 여기서 막지 않고 코드가 지운다(normalizeClassifications).
import * as v from 'valibot';
import { checkClassification, describeIssues } from '../core/menu-classification.ts';
import { sortTags } from '../core/menu-classification.ts';
import { AVOID_TAGS, CRITERION_IDS, MENU_CLASSES, NUTRITION_TAGS, type MenuClassification } from '../core/types.ts';

// 받아 줄 수 있는 모양은 받는다. 검증에 실패하면 Flue가 다시 요청해 1분 넘게 더 걸린다 (interview-schema.ts와 같음)
// - 빈 값을 null로 낸다
// - 값이 하나면 배열 대신 문자열로 낸다 (gemma, B6 실제 실행: "criterionIds": "reduce_saturated_fat")
const oneOrMany = <T extends v.GenericSchema<string>>(item: T) => v.nullish(v.union([v.array(item), item]));

// 정해진 값 목록은 쉼표로 이은 문자열 하나도 받는다 (B23 gemma 실제 실행: "criterionIds": "increase_fiber,reduce_portion_calories").
// 메뉴 30개를 통째로 다시 쓰느라 분류가 137초·560 Neuron이 됐다. 나눈 값이 목록에 없으면 그대로 실패(다시 요청)
const listOf = <T extends v.GenericSchema<string>>(item: T) =>
  v.nullish(
    v.union([
      v.array(item),
      v.pipe(
        v.string(),
        v.transform((s) => s.split(',').map((x) => x.trim()).filter((x) => x !== '')),
        v.array(item),
      ),
    ]),
  );

// - 메뉴 이름 앞뒤에 공백·줄바꿈을 붙인다 (대상 목록은 classificationTargets가 trim한다) (T9-3)
// - reason을 null로 내거나 뺀다. 빈 이유는 화면에 빈 칸으로 보인다 (T9-3)
const ClassificationSchema = v.object({
  menu: v.pipe(v.string(), v.trim()),
  class: v.picklist(MENU_CLASSES),
  reason: v.nullish(v.string()),
  criterionIds: listOf(v.picklist(CRITERION_IDS)),
  orderTips: oneOrMany(v.string()),
  // T13-4: 메뉴마다 한 번 정하는 태그. 목록에 없는 값은 거절해 Flue가 다시 요청한다
  tags: listOf(v.picklist([...AVOID_TAGS, ...NUTRITION_TAGS])),
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
    reason: c.reason ?? '',
    criterionIds: toArray(c.criterionIds),
    orderTips: toArray(c.orderTips),
    // tags를 빼고 내면 "모름"이라 없음 그대로(외식 칸은 생성 모델 태그를 쓴다), null은 "태그 없음"
    ...(c.tags === undefined ? {} : { tags: sortTags(toArray(c.tags)) }),
  }));
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value];
}
