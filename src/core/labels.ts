// 스펙 6장 한글 라벨표
import type {
  AvoidTag,
  CriterionId,
  Day,
  DayType,
  GoalId,
  MealPlace,
  MealSetting,
  MealType,
  Medication,
  MenuClass,
} from './types.ts';

export const DAY_LABELS: Record<Day, string> = {
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
  sun: '일요일',
};

export const MEAL_LABELS: Record<MealType, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁' };

export const AVOID_TAG_LABELS: Record<AvoidTag, string> = {
  dairy: '유제품',
  egg: '달걀',
  wheat: '밀',
  soy: '콩',
  peanut: '땅콩',
  tree_nut: '견과류',
  fish: '생선',
  shellfish: '갑각류·조개류',
  meat: '고기',
  pork: '돼지고기',
  beef: '소고기',
  chicken: '닭고기',
};

export const GOAL_LABELS: Record<GoalId, string> = {
  weight_loss: '체중 감량',
  blood_glucose: '혈당 관리',
  cholesterol: '콜레스테롤 관리',
};

export const DAY_TYPE_LABELS: Record<DayType, string> = { weekday: '평일', weekend: '주말' };

export const MEDICATION_LABELS: Record<Medication, string> = {
  none: '없음',
  glucose: '혈당약',
  cholesterol: '콜레스테롤약',
  other: '그 밖의 약',
};

export const PLACE_LABELS: Record<MealPlace, string> = { skip: '안 먹음', eat_out: '외식', home: '집밥' };

export const COMPANION_LABELS: Record<MealSetting['companions'], string> = {
  alone: '혼자',
  family: '가족과',
  others: '다른 사람과',
};

export const CRITERION_LABELS: Record<CriterionId, string> = {
  reduce_portion_calories: '양과 열량 줄이기',
  reduce_refined_carbs: '정제 탄수화물 줄이기',
  reduce_saturated_fat: '포화지방 줄이기',
  increase_fiber: '식이섬유 늘리기',
};

export const MENU_CLASS_LABELS: Record<MenuClass, string> = {
  often: '자주 먹어도 됨',
  weekly_max_1: '주 1회까지',
  avoid: '피하기',
};
