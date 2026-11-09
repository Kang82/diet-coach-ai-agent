// 외식 메뉴 분류 실행 (스펙 4.2, tasks.md B5).
// LLM 호출은 MenuClassifier 포트 뒤에 둔다 (plan-generator.ts와 같은 방식). 도구(agents/classify-menus-tool.ts)는 결과 저장만 한다.
import { buildCriteria } from './criteria.ts';
import { classificationTargets, normalizeClassifications, type ClassifyInput } from './menu-classification.ts';
import type { LlmResult, TokenUsage } from './plan-generator.ts';
import { LlmTimeoutError } from './llm-timeout.ts';
import { QuotaExceededError } from './quota.ts';
import type { MenuClassification, Profile } from './types.ts';

export interface MenuClassifier {
  /** 대상 메뉴마다 분류 하나. 1:1 확인과 정리는 runClassification이 한다 */
  classify(input: ClassifyInput): Promise<LlmResult<MenuClassification[]>>;
}

export type ClassifyOutcome =
  | { kind: 'ok'; classes: MenuClassification[]; usages: TokenUsage[] }
  | { kind: 'quota'; usages: TokenUsage[] }
  /** 시간 제한을 넘겨 멈춤 (B6). 멈춘 호출의 사용량은 알 수 없다 */
  | { kind: 'timeout'; usages: TokenUsage[] };

/**
 * 외식 끼니가 없으면 LLM을 부르지 않는다. 결과가 대상과 1:1이 아니면 에러를 던진다.
 * known(이전 대화에서 정한 분류, B16 T12-4)에 같은 이름이 있는 메뉴는 그 값을 쓰고 남은 메뉴만 모델에 보낸다. 다 있으면 부르지 않는다
 */
export async function runClassification(
  classifier: MenuClassifier,
  profile: Pick<Profile, 'goals' | 'avoid' | 'meals'>,
  known: readonly MenuClassification[] = [],
): Promise<ClassifyOutcome> {
  const targets = classificationTargets(profile.meals);
  if (targets.length === 0) return { kind: 'ok', classes: [], usages: [] };

  const rules = buildCriteria(profile.goals);
  const reused = targets.flatMap((menu) => {
    const k = known.find((c) => c.menu === menu);
    return k ? [{ ...structuredClone(k), menu }] : [];
  });
  const menus = targets.filter((menu) => !reused.some((c) => c.menu === menu));
  // 지금 기준에 없는 기준 ID와 빈 팁은 모델 결과와 같게 정리한다
  const merge = (fresh: readonly MenuClassification[]) =>
    normalizeClassifications(targets, [...reused, ...fresh], rules, profile.avoid);
  if (menus.length === 0) return { kind: 'ok', classes: merge([]), usages: [] };
  try {
    const res = await classifier.classify({ menus, rules, avoid: [...profile.avoid] });
    // 모델 결과가 남은 메뉴와 1:1인지 먼저 본다 (이월한 메뉴를 모델이 다시 내면 1:1이 아니다)
    normalizeClassifications(menus, res.value, rules);
    return { kind: 'ok', classes: merge(res.value), usages: [res.usage] };
  } catch (error) {
    if (error instanceof QuotaExceededError) return { kind: 'quota', usages: [] };
    if (error instanceof LlmTimeoutError) return { kind: 'timeout', usages: [] };
    throw error;
  }
}
