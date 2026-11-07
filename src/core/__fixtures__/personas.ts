// 스펙 8.5 평가 세트 페르소나 B~D (T1-7). 페르소나 A는 persona-a.ts.
// 스펙에 정해지지 않은 끼니는 페르소나 A처럼 아침은 거르고, 주말 점심·저녁은 집밥(조리 시간 제한 없음)으로 둔다.
// 분류의 기준(criterionIds)은 그 페르소나 목표의 기준만 쓴다(buildCriteria).
import type { MealSetting, MenuClassification, Profile } from '../types.ts';

const CREATED = '2026-11-07T09:00:00+09:00';

function mealsWith(lunchMenus: string[], dinnerCookMinutes: number): MealSetting[] {
  return [
    { dayType: 'weekday', meal: 'breakfast', place: 'skip', companions: 'alone' },
    { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'others', menus: lunchMenus },
    { dayType: 'weekday', meal: 'dinner', place: 'home', companions: 'alone', cookMinutes: dinnerCookMinutes },
    { dayType: 'weekend', meal: 'breakfast', place: 'skip', companions: 'family' },
    { dayType: 'weekend', meal: 'lunch', place: 'home', companions: 'family' },
    { dayType: 'weekend', meal: 'dinner', place: 'home', companions: 'family' },
  ];
}

/** B. 감량만: 평일 점심 구내식당 메뉴 5개, 저녁 집밥 15분 */
export const profileB: Profile = {
  userId: 'user-b',
  version: 1,
  goals: ['weight_loss'],
  goalNote: '',
  medication: 'none',
  avoid: [],
  avoidNote: '',
  meals: mealsWith(['제육볶음', '돈가스', '비빔밥', '김치찌개', '생선구이'], 15),
  consentedAt: CREATED,
  updatedAt: CREATED,
};

export const classesB: MenuClassification[] = [
  {
    menu: '제육볶음',
    class: 'weekly_max_1',
    reason: '기름진 돼지고기와 양념이라 열량이 높음',
    criterionIds: ['reduce_portion_calories'],
    orderTips: ['밥 반 공기'],
  },
  {
    menu: '돈가스',
    class: 'weekly_max_1',
    reason: '튀김이라 열량이 높음',
    criterionIds: ['reduce_portion_calories'],
    orderTips: ['소스 따로', '밥 반 공기'],
  },
  {
    menu: '비빔밥',
    class: 'often',
    reason: '채소가 많아 같은 양에 열량이 낮음',
    criterionIds: ['reduce_portion_calories'],
    orderTips: ['고추장 절반'],
  },
  {
    menu: '김치찌개',
    class: 'often',
    reason: '국물 위주라 밥 양만 조절하면 열량이 적당함',
    criterionIds: ['reduce_portion_calories'],
    orderTips: ['밥 반 공기'],
  },
  {
    menu: '생선구이',
    class: 'often',
    reason: '튀기지 않은 생선이라 열량이 낮음',
    criterionIds: ['reduce_portion_calories'],
    orderTips: [],
  },
];

/** C. 혈당 관리: 평일 점심 외식(김밥, 칼국수, 백반, 비빔밥), 저녁 집밥 30분, 약 복용 없음 */
export const profileC: Profile = {
  userId: 'user-c',
  version: 1,
  goals: ['blood_glucose'],
  goalNote: '',
  medication: 'none',
  avoid: [],
  avoidNote: '',
  meals: mealsWith(['김밥', '칼국수', '백반', '비빔밥'], 30),
  consentedAt: CREATED,
  updatedAt: CREATED,
};

export const classesC: MenuClassification[] = [
  {
    menu: '김밥',
    class: 'often',
    reason: '채소가 들어가고 밥 양을 조절하기 쉬움',
    criterionIds: ['increase_fiber'],
    orderTips: ['밥 적게'],
  },
  {
    menu: '칼국수',
    class: 'weekly_max_1',
    reason: '흰 밀가루 면이 주식이라 혈당이 빨리 오름',
    criterionIds: ['reduce_refined_carbs'],
    orderTips: ['면 절반', '채소 추가'],
  },
  {
    menu: '백반',
    class: 'often',
    reason: '나물 반찬으로 식이섬유를 채울 수 있음',
    criterionIds: ['increase_fiber'],
    orderTips: ['잡곡밥으로'],
  },
  {
    menu: '비빔밥',
    class: 'often',
    reason: '채소가 많아 식이섬유가 많음',
    criterionIds: ['increase_fiber'],
    orderTips: ['고추장 절반'],
  },
];

/** D. 콜레스테롤 + 채식(고기, 생선, 갑각류 피함): 평일 점심 외식, 저녁 집밥 20분 */
export const profileD: Profile = {
  userId: 'user-d',
  version: 1,
  goals: ['cholesterol'],
  goalNote: '',
  medication: 'none',
  avoid: ['meat', 'fish', 'shellfish'],
  avoidNote: '채식을 해요',
  meals: mealsWith(['산채비빔밥', '콩국수', '두부조림 정식', '채소김밥'], 20),
  consentedAt: CREATED,
  updatedAt: CREATED,
};

export const classesD: MenuClassification[] = [
  {
    menu: '산채비빔밥',
    class: 'often',
    reason: '산나물이 많아 식이섬유가 많음',
    criterionIds: ['increase_fiber'],
    orderTips: [],
  },
  {
    menu: '콩국수',
    class: 'often',
    reason: '콩 단백질이라 포화지방이 적음',
    criterionIds: ['reduce_saturated_fat'],
    orderTips: [],
  },
  {
    menu: '두부조림 정식',
    class: 'often',
    reason: '두부로 단백질을 채워 포화지방이 적음',
    criterionIds: ['reduce_saturated_fat'],
    orderTips: ['나물 반찬 고르기'],
  },
  {
    menu: '채소김밥',
    class: 'often',
    reason: '고기 없이 채소로 채운 김밥이라 포화지방이 적음',
    criterionIds: ['reduce_saturated_fat', 'increase_fiber'],
    orderTips: [],
  },
];
