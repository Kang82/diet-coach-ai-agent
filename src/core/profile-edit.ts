// 프로필 확인 화면의 순수 로직 (스펙 7장, tasks.md B6 T5-2, T5-5).
// - 고치기: 한 항목만 초안에서 비우고 그 단계부터 다시 묻는다 (다음 질문은 nextField가 정한다)
// - 저장된 인터뷰 결과 → 초안 (지난 프로필로 시작, 바뀐 항목 고치기)
// - 식단 기준 문구
import { sameMealKey } from './helpers.ts';
import { CRITERION_LABELS, NUTRITION_TAG_LABELS } from './labels.ts';
import type { InterviewResult } from './interview.ts';
import { NUTRITION_TAGS } from './types.ts';
import type { CriteriaRules, DraftMealSetting, InterviewDraft, InterviewState, MealKey } from './types.ts';

export type ProfileSection =
  | { kind: 'goals' }
  | { kind: 'medication' }
  | { kind: 'avoid' }
  | { kind: 'meals' }
  | { kind: 'menus'; meal: MealKey }
  | { kind: 'cookMinutes'; meal: MealKey };

/** 그 항목만 비운 상태. 원본은 고치지 않는다 */
export function reopenSection(state: InterviewState, section: ProfileSection): InterviewState {
  const draft: InterviewDraft = structuredClone(state.draft);
  let menuFollowUps = structuredClone(state.menuFollowUps);
  switch (section.kind) {
    case 'goals':
      delete draft.goals;
      delete draft.goalNote;
      delete draft.medication;
      break;
    case 'medication':
      delete draft.medication;
      break;
    case 'avoid':
      delete draft.avoid;
      delete draft.avoidNote;
      break;
    case 'meals':
      delete draft.meals;
      menuFollowUps = [];
      break;
    case 'menus':
      draft.meals = draft.meals?.map((m) => (sameMealKey(m, section.meal) ? omit(m, 'menus') : m));
      menuFollowUps = menuFollowUps.filter((k) => !sameMealKey(k, section.meal));
      break;
    case 'cookMinutes':
      draft.meals = draft.meals?.map((m) => (sameMealKey(m, section.meal) ? omit(m, 'cookMinutes') : m));
      break;
  }
  return { draft, stopFlags: [...state.stopFlags], menuFollowUps };
}

/** 끝난 인터뷰 결과를 다시 초안으로. 조리 시간이 없는 집밥 끼니는 "상관없다"(null) */
export function draftFromResult(result: InterviewResult): InterviewDraft {
  return {
    goals: [...result.goals],
    goalNote: result.goalNote,
    medication: result.medication,
    avoid: [...result.avoid],
    avoidNote: result.avoidNote,
    meals: result.meals.map((m) => {
      const meal: DraftMealSetting = { dayType: m.dayType, meal: m.meal, place: m.place, companions: m.companions };
      if (m.place === 'eat_out') meal.menus = [...(m.menus ?? [])];
      if (m.place === 'home') meal.cookMinutes = m.cookMinutes ?? null;
      return meal;
    }),
  };
}

export interface CriteriaText {
  /** 식단 기준 라벨 */
  criteria: string[];
  /** 1주일 횟수 제한 ("튀김: 주 1회까지", 0이면 "넣지 않음") */
  limits: string[];
}

export function criteriaText(rules: CriteriaRules): CriteriaText {
  const limits: string[] = [];
  for (const tag of NUTRITION_TAGS) {
    const max = rules.tagLimits[tag];
    if (max === undefined) continue;
    limits.push(`${NUTRITION_TAG_LABELS[tag]}: ${max === 0 ? '넣지 않음' : `주 ${max}회까지`}`);
  }
  return { criteria: rules.criteria.map((id) => CRITERION_LABELS[id]), limits };
}

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
