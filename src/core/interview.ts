// 스펙 4.1 인터뷰: 다음 질문(nextField), 초안 병합, 인터뷰 끝의 마무리. 순수 함수.
// 다음에 물을 질문은 상태에 저장하지 않고 초안에서 매번 계산한다.
import { MEAL_KEYS, mealKeyOrder, sameMealKey, toMealKey } from './helpers.ts';
import { needsMedication } from './profile-validation.ts';
import type { DraftMealSetting, InterviewDraft, InterviewField, MealSetting, Profile } from './types.ts';

/** 인터뷰로 채우는 프로필 항목. 사용자 ID, 버전, 동의 시각은 프로필 확인 화면에서 채운다 */
export type InterviewResult = Pick<Profile, 'goals' | 'goalNote' | 'medication' | 'avoid' | 'avoidNote' | 'meals'>;

export function nextField(draft: InterviewDraft): InterviewField | null {
  if (!draft.goals?.length) return 'goals';
  if (needsMedication(draft.goals) && draft.medication === undefined) return 'medication';
  if (draft.avoid === undefined) return 'avoid';

  const meals = MEAL_KEYS.map((key) => draft.meals?.find((m) => sameMealKey(m, key)));
  if (meals.some((m) => m?.place === undefined)) return 'meals';

  const settings = meals as DraftMealSetting[];
  const noMenus = settings.find((m) => m.place === 'eat_out' && !hasMenus(m));
  if (noMenus) return { menusFor: toMealKey(noMenus) };
  const noCookTime = settings.find((m) => m.place === 'home' && m.cookMinutes === undefined);
  if (noCookTime) return { cookMinutesFor: toMealKey(noCookTime) };
  return null;
}

/** 초안에 이번 턴의 값을 합친다. 끼니는 (dayType, meal)끼리 필드 단위로, 나머지는 덮어쓴다. undefined는 무시한다 */
export function mergeDraft(draft: InterviewDraft, filled: InterviewDraft): InterviewDraft {
  const { meals: filledMeals, ...rest } = filled;
  const merged: InterviewDraft = { ...structuredClone(draft), ...definedOnly(structuredClone(rest)) };
  if (!filledMeals) return merged;

  const meals = merged.meals ?? [];
  for (const update of structuredClone(filledMeals)) {
    const index = meals.findIndex((m) => sameMealKey(m, update));
    if (index === -1) meals.push(update);
    else meals[index] = { ...meals[index]!, ...definedOnly(update) };
  }
  merged.meals = meals.sort((a, b) => mealKeyOrder(a) - mealKeyOrder(b));
  return merged;
}

/** 인터뷰가 끝난 초안을 프로필 항목으로 바꾼다. 끝나지 않았으면 에러 */
export function finishDraft(draft: InterviewDraft): InterviewResult {
  const field = nextField(draft);
  if (field !== null) throw new Error(`인터뷰가 끝나지 않았습니다: ${JSON.stringify(field)}`);

  const meals = MEAL_KEYS.map((key) => toMealSetting(draft.meals!.find((m) => sameMealKey(m, key))!));
  return {
    goals: [...new Set(draft.goals!)],
    goalNote: draft.goalNote ?? '',
    medication: needsMedication(draft.goals) ? draft.medication! : 'none',
    avoid: draft.avoid!,
    avoidNote: draft.avoidNote ?? '',
    meals,
  };
}

function toMealSetting(m: DraftMealSetting): MealSetting {
  const setting: MealSetting = {
    dayType: m.dayType,
    meal: m.meal,
    place: m.place!,
    companions: m.companions ?? 'alone',
  };
  if (m.place === 'eat_out') setting.menus = m.menus!.map((menu) => menu.trim()).filter((menu) => menu !== '');
  if (m.place === 'home' && typeof m.cookMinutes === 'number') setting.cookMinutes = m.cookMinutes;
  return setting;
}

export function hasMenus(m: DraftMealSetting): boolean {
  return !!m.menus?.some((menu) => menu.trim() !== '');
}

/** 외식 메뉴 개수 (공백뿐인 값 제외) */
export function menuCount(m: DraftMealSetting): number {
  return m.menus?.filter((menu) => menu.trim() !== '').length ?? 0;
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
