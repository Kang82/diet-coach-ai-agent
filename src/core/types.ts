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
  'same_meal_consecutive_days', // 같은 끼니, 연속된 요일에 같은 메뉴
  'menu_weekly_limit', // 같은 메뉴 주 2회 초과
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

// 4.1 인터뷰

/**
 * 끼니 설정 초안. 끼니(dayType, meal) 말고는 한 턴에 일부만 채워질 수 있다.
 * cookMinutes: undefined는 아직 안 물음, null은 "상관없다"(시간 제한 없음). companions가 없으면 "alone"
 */
export interface DraftMealSetting extends Partial<Omit<MealSetting, 'cookMinutes'>> {
  dayType: DayType;
  meal: MealType;
  cookMinutes?: number | null;
}

/** 인터뷰 중 프로필 초안. avoid: undefined는 아직 안 물음, []는 "없음" */
export interface InterviewDraft extends Omit<Partial<Profile>, 'meals'> {
  meals?: DraftMealSetting[];
}

export interface MealKey {
  dayType: DayType;
  meal: MealType;
}

export type InterviewField =
  | 'goals'
  | 'medication'
  | 'avoid'
  | 'meals'
  | { menusFor: MealKey }
  | { cookMinutesFor: MealKey };

export const STOP_FLAGS = ['pregnancy', 'kidney_disease', 'glucose_medication'] as const;
export type StopFlag = (typeof STOP_FLAGS)[number];

/** 그 턴에만 처리하고 버린다 */
export type TurnFlag =
  | 'extreme_restriction'
  | 'unsupported_goal'
  | 'asks_lab_interpretation'
  | 'asks_medication_advice';

export interface InterviewState {
  draft: InterviewDraft;
  /** 한 번 생기면 남는다 */
  stopFlags: StopFlag[];
  /** 외식 메뉴가 2개 이하라 한 번 더 물어본 끼니 (분기 6). 두 번째에는 그대로 진행한다 */
  menuFollowUps: MealKey[];
}

/** LLM이 한 턴마다 내는 값 */
export interface InterviewUpdate {
  filled: InterviewDraft;
  ambiguous?: { field: InterviewField; choices: string[] };
  stopFlags: StopFlag[];
  turnFlags: TurnFlag[];
  reply: string;
}
