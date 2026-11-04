// 스펙 1장 데이터 스키마. 배열 상수의 순서가 곧 정렬 순서다 (순서를 바꾸지 말 것).

export const GOAL_IDS = ['weight_loss', 'blood_glucose', 'cholesterol'] as const;
export type GoalId = (typeof GOAL_IDS)[number];

export const CRITERION_IDS = [
  'reduce_portion_calories', // 양과 열량 줄이기
  'reduce_refined_carbs', // 정제 탄수화물 줄이기
  'reduce_saturated_fat', // 포화지방 줄이기
  'increase_fiber', // 식이섬유 늘리기
] as const;
export type CriterionId = (typeof CRITERION_IDS)[number];

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

export type DayType = 'weekday' | 'weekend';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export type MealPlace = 'skip' | 'eat_out' | 'home';

export const AVOID_TAGS = [
  'dairy',
  'egg',
  'wheat',
  'soy',
  'peanut',
  'tree_nut',
  'fish',
  'shellfish',
  'meat',
  'pork',
  'beef',
  'chicken',
] as const;
export type AvoidTag = (typeof AVOID_TAGS)[number];

export const NUTRITION_TAGS = [
  'fried', // 튀김
  'fatty_meat', // 기름진 고기
  'processed_meat', // 햄, 소시지
  'refined_carb_main', // 흰 면, 흰 빵이 주식
  'sugary', // 단 소스, 디저트
] as const;
export type NutritionTag = (typeof NUTRITION_TAGS)[number];

export type Tag = AvoidTag | NutritionTag;

export interface Slot {
  day: Day;
  meal: MealType;
}

// 1.2 프로필

export interface MealSetting {
  dayType: DayType;
  meal: MealType;
  place: MealPlace;
  companions: 'alone' | 'family' | 'others';
  menus?: string[]; // eat_out이면 필수
  cookMinutes?: number; // home일 때 선택. 없으면 시간 제한 없음
}

export type Medication = 'none' | 'glucose' | 'cholesterol' | 'other';

export interface Profile {
  userId: string;
  version: number;
  goals: GoalId[];
  goalNote: string;
  medication: Medication;
  avoid: AvoidTag[];
  avoidNote: string;
  meals: MealSetting[];
  consentedAt: string;
  updatedAt: string;
}

// 1.3 외식 메뉴 분류

export type MenuClass = 'often' | 'weekly_max_1' | 'avoid';

export interface MenuClassification {
  menu: string;
  class: MenuClass;
  reason: string;
  criterionIds: CriterionId[];
  orderTips: string[];
}

// 1.4 식단표

export interface PlanCell extends Slot {
  place: 'eat_out' | 'home';
  menuId: string;
  title: string;
  ingredients: string[];
  tags: Tag[];
  orderTip?: string;
  cookMinutes: number;
  reason: string;
  criterionIds: CriterionId[];
}

export interface PlanEvent extends Slot {
  note: string;
}

export interface Plan {
  planId: string;
  userId: string;
  profileVersion: number;
  weekStart: string;
  events: PlanEvent[];
  cells: PlanCell[];
  createdAt: string;
}

// 2장 기준

export interface CriteriaRules {
  criteria: CriterionId[];
  tagLimits: Partial<Record<NutritionTag, number>>;
}

// 1.5 점검 결과

export const RULE_IDS = [
  'unexpected_cell',
  'missing_cell',
  'avoid_tag',
  'eat_out_not_in_list',
  'class_avoid',
  'class_weekly_limit',
  'tag_weekly_limit',
  'consecutive_menu',
  'cook_time_exceeded',
  'reason_criterion',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface Violation {
  rule: RuleId;
  cells: Slot[];
  regenerate: Slot[];
  detail?: string;
}

export interface CheckStats {
  avoidTagCounts: Partial<Record<AvoidTag, number>>;
  limitedMenuCounts: Record<string, number>;
  limitedTagCounts: Partial<Record<NutritionTag, number>>;
  consecutiveCount: number;
}

export interface CheckResult {
  passed: boolean;
  violations: Violation[];
  stats: CheckStats;
}
