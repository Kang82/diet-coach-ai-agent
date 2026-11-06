// 외식 메뉴 분류 실행 (스펙 4.2, tasks.md B5).
// LLM 호출은 MenuClassifier 포트 뒤에 둔다 (plan-generator.ts와 같은 방식). 도구(agents/classify-menus-tool.ts)는 결과 저장만 한다.
import { buildCriteria } from './criteria.ts';
import { classificationTargets, normalizeClassifications, type ClassifyInput } from './menu-classification.ts';
import type { LlmResult, TokenUsage } from './plan-generator.ts';
import { QuotaExceededError } from './quota.ts';
import type { MenuClassification, Profile } from './types.ts';

export interface MenuClassifier {
  /** 대상 메뉴마다 분류 하나. 1:1 확인과 정리는 runClassification이 한다 */
  classify(input: ClassifyInput): Promise<LlmResult<MenuClassification[]>>;
}

export type ClassifyOutcome =
  | { kind: 'ok'; classes: MenuClassification[]; usages: TokenUsage[] }
  | { kind: 'quota'; usages: TokenUsage[] };

/** 외식 끼니가 없으면 LLM을 부르지 않는다. 결과가 대상과 1:1이 아니면 에러를 던진다 */
export async function runClassification(
  classifier: MenuClassifier,
  profile: Pick<Profile, 'goals' | 'avoid' | 'meals'>,
): Promise<ClassifyOutcome> {
  const menus = classificationTargets(profile.meals);
  if (menus.length === 0) return { kind: 'ok', classes: [], usages: [] };

  const rules = buildCriteria(profile.goals);
  try {
    const res = await classifier.classify({ menus, rules, avoid: [...profile.avoid] });
    return { kind: 'ok', classes: normalizeClassifications(menus, res.value, rules), usages: [res.usage] };
  } catch (error) {
    if (error instanceof QuotaExceededError) return { kind: 'quota', usages: [] };
    throw error;
  }
}
