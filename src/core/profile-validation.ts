// 스펙 1.2 프로필 검증 (코드). 에러를 던지지 않고 문제 목록을 돌려준다. 비어 있으면 통과.
// 프로필 확인 화면(T5-2)이 항목별로 보여 줄 수 있게 문구 대신 code만 둔다.
import { MEAL_KEYS, mealKeyOrder, sameMealKey, toMealKey } from './helpers.ts';
import type { GoalId, MealKey, Profile } from './types.ts';

/** 선언 순서가 곧 문제 목록의 정렬 순서다 */
export const PROFILE_ISSUE_CODES = [
  'goals_empty',
  'goals_duplicate',
  'meal_missing',
  'meal_duplicate',
  'menus_required',
  'medication_without_goal',
  'consent_missing',
] as const;
export type ProfileIssueCode = (typeof PROFILE_ISSUE_CODES)[number];

export interface ProfileIssue {
  code: ProfileIssueCode;
  /** 끼니 관련 문제일 때 그 끼니 */
  meal?: MealKey;
}

/** 약 복용을 묻는 목표. 이 목표가 없으면 medication은 "none"이어야 한다 */
export const MEDICATION_GOALS: readonly GoalId[] = ['blood_glucose', 'cholesterol'];

export function needsMedication(goals: readonly GoalId[] | undefined): boolean {
  return !!goals?.some((g) => MEDICATION_GOALS.includes(g));
}

export function validateProfile(profile: Profile): ProfileIssue[] {
  const issues: ProfileIssue[] = [];

  if (profile.goals.length === 0) issues.push({ code: 'goals_empty' });
  if (new Set(profile.goals).size !== profile.goals.length) issues.push({ code: 'goals_duplicate' });

  for (const key of MEAL_KEYS) {
    const count = profile.meals.filter((m) => sameMealKey(m, key)).length;
    if (count === 0) issues.push({ code: 'meal_missing', meal: key });
    if (count > 1) issues.push({ code: 'meal_duplicate', meal: key });
  }

  for (const m of profile.meals) {
    if (m.place === 'eat_out' && !m.menus?.some((menu) => menu.trim() !== '')) {
      issues.push({ code: 'menus_required', meal: toMealKey(m) });
    }
  }

  if (!needsMedication(profile.goals) && profile.medication !== 'none') {
    issues.push({ code: 'medication_without_goal' });
  }
  if (!profile.consentedAt) issues.push({ code: 'consent_missing' });

  return issues.sort(
    (a, b) =>
      PROFILE_ISSUE_CODES.indexOf(a.code) - PROFILE_ISSUE_CODES.indexOf(b.code) ||
      (a.meal ? mealKeyOrder(a.meal) : -1) - (b.meal ? mealKeyOrder(b.meal) : -1),
  );
}
