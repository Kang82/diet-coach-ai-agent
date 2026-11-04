// 스펙 8.1 기본 픽스처: 페르소나 A (기획서 예시)
// 테스트마다 structuredClone으로 복사해서 고쳐 쓴다.

import type { MenuClassification, Plan, PlanCell, Profile } from '../types.ts';

export const profileA: Profile = {
  userId: 'user-a',
  version: 1,
  goals: ['weight_loss', 'cholesterol'],
  goalNote: '체중 5kg 감량, 콜레스테롤 관리',
  medication: 'none',
  avoid: ['dairy'],
  avoidNote: '우유를 마시면 배가 아파요',
  meals: [
    { dayType: 'weekday', meal: 'breakfast', place: 'skip', companions: 'alone' },
    {
      dayType: 'weekday',
      meal: 'lunch',
      place: 'eat_out',
      companions: 'others',
      menus: ['국밥', '백반', '돈가스', '쌀국수', '회덮밥'],
    },
    { dayType: 'weekday', meal: 'dinner', place: 'home', companions: 'alone', cookMinutes: 20 },
    { dayType: 'weekend', meal: 'breakfast', place: 'skip', companions: 'family' },
    { dayType: 'weekend', meal: 'lunch', place: 'home', companions: 'family' },
    { dayType: 'weekend', meal: 'dinner', place: 'home', companions: 'family' },
  ],
  consentedAt: '2026-11-01T22:00:00+09:00',
  updatedAt: '2026-11-01T22:00:00+09:00',
};

export const classesA: MenuClassification[] = [
  {
    menu: '회덮밥',
    class: 'often',
    reason: '생선과 채소 위주라 포화지방이 적음',
    criterionIds: ['reduce_saturated_fat'],
    orderTips: ['초장 절반'],
  },
  {
    menu: '백반',
    class: 'often',
    reason: '생선·나물 반찬을 고르면 포화지방이 적음',
    criterionIds: ['reduce_saturated_fat', 'increase_fiber'],
    orderTips: ['생선 반찬 고르기'],
  },
  {
    menu: '쌀국수',
    class: 'often',
    reason: '국물 위주이고 숙주로 양을 채울 수 있음',
    criterionIds: ['reduce_portion_calories'],
    orderTips: ['숙주 추가'],
  },
  {
    menu: '국밥',
    class: 'weekly_max_1',
    reason: '고기 기름과 밥 양이 많음',
    criterionIds: ['reduce_portion_calories', 'reduce_saturated_fat'],
    orderTips: ['국물과 밥 남기기'],
  },
  {
    menu: '돈가스',
    class: 'weekly_max_1',
    reason: '튀김이라 포화지방과 열량이 많음',
    criterionIds: ['reduce_portion_calories', 'reduce_saturated_fat'],
    orderTips: ['밥 반 공기', '소스 따로'],
  },
];

type CellInput = Pick<PlanCell, 'day' | 'meal' | 'place' | 'menuId' | 'tags' | 'cookMinutes' | 'criterionIds'> &
  Partial<PlanCell>;

function cell(input: CellInput): PlanCell {
  return {
    title: input.menuId,
    ingredients: [],
    reason: '',
    ...input,
  };
}

export const planA: Plan = {
  planId: 'plan-a',
  userId: 'user-a',
  profileVersion: 1,
  weekStart: '2026-11-09',
  events: [],
  createdAt: '2026-11-08T22:00:00+09:00',
  cells: [
    cell({ day: 'mon', meal: 'lunch', place: 'eat_out', menuId: '회덮밥', title: '회덮밥 (초장 절반)', tags: ['fish'], cookMinutes: 0, criterionIds: ['reduce_saturated_fat'], reason: '생선으로 포화지방 줄이기' }),
    cell({ day: 'mon', meal: 'dinner', place: 'home', menuId: '두부 채소 볶음', tags: ['soy'], cookMinutes: 15, criterionIds: ['reduce_saturated_fat', 'increase_fiber'], reason: '두부와 채소로 포화지방 줄이고 식이섬유 늘리기' }),
    cell({ day: 'tue', meal: 'lunch', place: 'eat_out', menuId: '백반', title: '백반 (생선 반찬)', tags: ['fish'], cookMinutes: 0, criterionIds: ['reduce_saturated_fat'], reason: '생선 반찬으로 포화지방 줄이기' }),
    cell({ day: 'tue', meal: 'dinner', place: 'home', menuId: '닭가슴살 샐러드', title: '닭가슴살 샐러드 (간장 드레싱)', tags: ['meat', 'chicken'], cookMinutes: 10, criterionIds: ['reduce_portion_calories'], reason: '열량은 낮추고 단백질은 유지' }),
    cell({ day: 'wed', meal: 'lunch', place: 'eat_out', menuId: '쌀국수', title: '쌀국수 (숙주 추가)', tags: ['meat', 'beef', 'refined_carb_main'], cookMinutes: 0, criterionIds: ['reduce_portion_calories'], reason: '숙주로 양 채우기' }),
    cell({ day: 'wed', meal: 'dinner', place: 'home', menuId: '연어 덮밥', title: '연어 덮밥 (마요네즈 없이)', tags: ['fish'], cookMinutes: 15, criterionIds: ['reduce_saturated_fat'], reason: '연어의 불포화지방' }),
    cell({ day: 'thu', meal: 'lunch', place: 'eat_out', menuId: '돈가스', title: '돈가스 (밥 반 공기, 소스 따로)', tags: ['meat', 'pork', 'fried', 'wheat'], cookMinutes: 0, criterionIds: ['reduce_portion_calories'], reason: '주 1회 메뉴는 양 줄여서' }),
    cell({ day: 'thu', meal: 'dinner', place: 'home', menuId: '달걀 채소볶음과 잡곡밥', tags: ['egg'], cookMinutes: 15, criterionIds: ['increase_fiber'], reason: '잡곡으로 식이섬유' }),
    cell({ day: 'fri', meal: 'lunch', place: 'eat_out', menuId: '국밥', title: '국밥 (국물과 밥 남기기)', tags: ['meat', 'beef'], cookMinutes: 0, criterionIds: ['reduce_portion_calories'], reason: '국물과 밥 양 줄이기' }),
    cell({ day: 'fri', meal: 'dinner', place: 'home', menuId: '두부 된장찌개와 잡곡밥', tags: ['soy'], cookMinutes: 20, criterionIds: ['increase_fiber'], reason: '잡곡으로 식이섬유' }),
    cell({ day: 'sat', meal: 'lunch', place: 'home', menuId: '비빔밥', tags: ['egg'], cookMinutes: 20, criterionIds: ['increase_fiber'], reason: '채소로 식이섬유' }),
    cell({ day: 'sat', meal: 'dinner', place: 'home', menuId: '생선구이 정식', tags: ['fish'], cookMinutes: 30, criterionIds: ['reduce_saturated_fat'], reason: '생선으로 포화지방 줄이기' }),
    cell({ day: 'sun', meal: 'lunch', place: 'home', menuId: '잔치국수', title: '잔치국수 (양 줄이기)', tags: ['wheat', 'refined_carb_main'], cookMinutes: 25, criterionIds: ['reduce_portion_calories'], reason: '국수 양 줄이기' }),
    cell({ day: 'sun', meal: 'dinner', place: 'home', menuId: '닭가슴살 샤브샤브', tags: ['meat', 'chicken'], cookMinutes: 30, criterionIds: ['reduce_portion_calories', 'increase_fiber'], reason: '샤브샤브로 채소와 단백질' }),
  ],
};
