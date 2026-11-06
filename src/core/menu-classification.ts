// 스펙 1.3, 4.2 외식 메뉴 분류 (tasks.md B5). LLM 호출 앞뒤의 코드 부분.
// - 분류 대상 목록을 정하고, LLM 출력이 대상과 1:1인지 확인한다 (메뉴 비교는 정확히 일치, CLAUDE.md)
// - 사용자가 화면에서 바꾼 분류를 반영한다 ("사용자가 분류를 고치면 그 값을 그대로 쓴다")
import { mealKeyOrder } from './helpers.ts';
import { AVOID_TAG_LABELS, CRITERION_LABELS } from './labels.ts';
import type { AvoidTag, CriteriaRules, MealSetting, MenuClass, MenuClassification } from './types.ts';

/** 사용자가 분류를 바꾼 메뉴의 이유. LLM이 쓴 이유는 바뀐 분류와 어긋날 수 있어 바꾼다 */
export const USER_CHOSEN_REASON = '직접 정한 분류';

export interface ClassificationIssue {
  code: 'missing' | 'extra' | 'duplicate';
  menu: string;
}

export interface MenuClassOverride {
  menu: string;
  class: MenuClass;
}

export interface ClassifyInput {
  /** classificationTargets 결과 */
  menus: string[];
  rules: CriteriaRules;
  avoid: AvoidTag[];
}

/** 외식 끼니의 menus를 끼니 순서(평일 아침 → 주말 저녁)로 합치고, 공백을 정리해 중복 없이 */
export function classificationTargets(meals: readonly MealSetting[]): string[] {
  const targets: string[] = [];
  const sorted = [...meals].sort((a, b) => mealKeyOrder(a) - mealKeyOrder(b));
  for (const meal of sorted) {
    if (meal.place !== 'eat_out') continue;
    for (const raw of meal.menus ?? []) {
      const menu = raw.trim();
      if (menu !== '' && !targets.includes(menu)) targets.push(menu);
    }
  }
  return targets;
}

/** 대상 목록과 1:1인지. 빠진 메뉴(대상 순서) → 추가된 메뉴(출력 순서) → 두 번 나온 메뉴 순 */
export function checkClassification(
  targets: readonly string[],
  classes: readonly Pick<MenuClassification, 'menu'>[],
): ClassificationIssue[] {
  const menus = classes.map((c) => c.menu);
  const issues: ClassificationIssue[] = [];
  for (const menu of targets) if (!menus.includes(menu)) issues.push({ code: 'missing', menu });
  for (const menu of menus) if (!targets.includes(menu)) issues.push({ code: 'extra', menu });
  const seen = new Set<string>();
  for (const menu of menus) {
    if (seen.has(menu) && targets.includes(menu) && !issues.some((i) => i.code === 'duplicate' && i.menu === menu)) {
      issues.push({ code: 'duplicate', menu });
    }
    seen.add(menu);
  }
  return issues;
}

/** LLM에 돌려줄 검증 메시지 (Flue 스키마 재요청) */
export function describeIssues(issues: readonly ClassificationIssue[]): string {
  const of = (code: ClassificationIssue['code']) =>
    issues.filter((i) => i.code === code).map((i) => JSON.stringify(i.menu));
  const parts: string[] = [];
  if (of('missing').length > 0) parts.push(`빠진 메뉴: ${of('missing').join(', ')}`);
  if (of('extra').length > 0) parts.push(`목록에 없는 메뉴: ${of('extra').join(', ')}`);
  if (of('duplicate').length > 0) parts.push(`두 번 나온 메뉴: ${of('duplicate').join(', ')}`);
  return `메뉴 목록의 메뉴를 글자 그대로 한 번씩만 분류하세요. ${parts.join(' / ')}`;
}

/**
 * LLM 출력 정리: 1:1이 아니면 에러, 대상 순서로 정렬, 이번 기준에 없는 criterionIds는 지운다
 * (다시 요청하지 않는다. Neuron을 아끼려는 것이다), 문자열은 앞뒤 공백을 지운다.
 */
export function normalizeClassifications(
  targets: readonly string[],
  classes: readonly MenuClassification[],
  rules: CriteriaRules,
): MenuClassification[] {
  const issues = checkClassification(targets, classes);
  if (issues.length > 0) throw new Error(`메뉴 분류가 대상 목록과 맞지 않습니다. ${describeIssues(issues)}`);
  return targets.map((menu) => {
    const c = classes.find((x) => x.menu === menu)!;
    return {
      menu,
      class: c.class,
      reason: c.reason.trim(),
      criterionIds: rules.criteria.filter((id) => c.criterionIds.includes(id)),
      orderTips: c.orderTips.map((t) => t.trim()).filter((t) => t !== ''),
    };
  });
}

/** 사용자가 바꾼 분류 반영. 저장된 분류에 없는 메뉴는 무시한다. 원본은 고치지 않는다 */
export function applyClassOverrides(
  classes: readonly MenuClassification[],
  overrides: readonly MenuClassOverride[],
): MenuClassification[] {
  return classes.map((c) => {
    const override = overrides.find((o) => o.menu === c.menu);
    if (!override || override.class === c.class) return structuredClone(c);
    return { ...structuredClone(c), class: override.class, reason: USER_CHOSEN_REASON };
  });
}

/**
 * 식단표를 만들 때 쓸 분류. 저장된 분류에 사용자 수정을 반영한다.
 * 외식 끼니가 없으면 분류 없이 빈 배열, 저장된 분류가 없거나 지금 메뉴와 1:1이 아니면 undefined(분류부터 다시)
 */
export function classesForPlan(
  meals: readonly MealSetting[],
  stored: readonly MenuClassification[] | undefined,
  overrides: readonly MenuClassOverride[] = [],
): MenuClassification[] | undefined {
  const targets = classificationTargets(meals);
  if (targets.length === 0) return [];
  if (!stored || checkClassification(targets, stored).length > 0) return undefined;
  return applyClassOverrides(stored, overrides);
}

export function buildClassifyPrompt({ menus, rules, avoid }: ClassifyInput): string {
  const lines = [
    '식단 코치 앱 사용자가 외식으로 고를 수 있는 메뉴를 사용자의 식단 기준에 맞춰 분류하세요.',
    `식단 기준: ${rules.criteria.map((id) => `${id}(${CRITERION_LABELS[id]})`).join(', ')}`,
  ];
  if (avoid.length > 0) lines.push(`피할 음식: ${avoid.map((t) => AVOID_TAG_LABELS[t]).join(', ')}`);
  lines.push(
    `메뉴 목록 (모두 한 번씩, 글자 그대로): ${menus.map((m) => JSON.stringify(m)).join(', ')}`,
    'class:',
    '- often: 기준에 맞거나 주문 방법만 바꾸면 자주 먹어도 되는 메뉴',
    '- weekly_max_1: 튀김, 기름진 고기, 흰 면 위주처럼 기준에 어긋나는 점이 있어 1주일에 1번까지만 먹을 메뉴',
    '- avoid: 피할 음식이 빠질 수 없거나 기준에 크게 어긋나는 메뉴',
    'reason: 분류한 이유를 짧은 한국어 한 문장으로',
    'criterionIds: 근거가 된 식단 기준 ID (위 식단 기준 중에서)',
    'orderTips: 기준에 맞게 주문하는 방법 0~2개, 짧은 한국어로 (예: "국물 남기기", "소스 따로")',
  );
  return lines.join('\n');
}
