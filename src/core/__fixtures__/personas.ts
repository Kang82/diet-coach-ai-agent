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

// E. 외식 메뉴가 많은 프로필 (tasks.md B14 T8-6). 배포본 사용자처럼 평일 점심·저녁 모두 외식이고, 목표 여러 개 + 피할 음식이 있다.
// 사용자 실제 프로필은 쓰지 않는다. 사용자 기록은 분류 입력 6,270~7,792토큰, 생성 출력 약 15,000토큰(페르소나 A~D의 약 2배)이었다.
// 평일 점심 20개(끼니당 상한 MAX_MENUS_PER_MEAL), 평일 저녁 15개(점심과 5개 겹침), 주말은 집밥
const lunchE = [
  '김치찌개', '된장찌개', '순두부찌개', '제육볶음', '돈가스', '비빔밥', '김밥', '라면', '칼국수', '쌀국수',
  '회덮밥', '생선구이 정식', '백반', '닭가슴살 샐러드', '샌드위치', '짜장면', '짬뽕', '볶음밥', '국밥', '포케',
];
const dinnerE = [
  '김치찌개', '된장찌개', '제육볶음', '국밥', '백반', '삼겹살', '치킨', '피자', '떡볶이', '보쌈',
  '샤브샤브', '연어덮밥', '불고기 정식', '우동', '파스타',
];

export const profileE: Profile = {
  userId: 'user-e',
  version: 1,
  goals: ['weight_loss', 'blood_glucose'],
  goalNote: '',
  medication: 'none',
  avoid: ['dairy', 'tree_nut'],
  avoidNote: '',
  meals: [
    { dayType: 'weekday', meal: 'breakfast', place: 'skip', companions: 'alone' },
    { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'others', menus: lunchE },
    { dayType: 'weekday', meal: 'dinner', place: 'eat_out', companions: 'others', menus: dinnerE },
    { dayType: 'weekend', meal: 'breakfast', place: 'skip', companions: 'family' },
    { dayType: 'weekend', meal: 'lunch', place: 'home', companions: 'family' },
    { dayType: 'weekend', meal: 'dinner', place: 'home', companions: 'family' },
  ],
  consentedAt: CREATED,
  updatedAt: CREATED,
};

const P = 'reduce_portion_calories' as const;
const C = 'reduce_refined_carbs' as const;
const F = 'increase_fiber' as const;
const e = (
  menu: string,
  cls: MenuClassification['class'],
  reason: string,
  criterionIds: MenuClassification['criterionIds'],
  orderTips: string[],
): MenuClassification => ({ menu, class: cls, reason, criterionIds, orderTips });

export const classesE: MenuClassification[] = [
  e('김치찌개', 'often', '국물 위주라 밥 양만 줄이면 열량과 탄수화물을 조절하기 쉬움', [P, C], ['밥 반 공기', '국물은 덜 먹기']),
  e('된장찌개', 'often', '두부와 채소가 들어가 식이섬유가 있음', [F, C], ['밥 반 공기', '건더기 위주']),
  e('순두부찌개', 'often', '두부 단백질이 많고 열량이 적당함', [P], ['밥 반 공기', '계란은 빼기']),
  e('제육볶음', 'weekly_max_1', '기름진 돼지고기와 단 양념이라 열량과 당이 높음', [P, C], ['밥 반 공기', '상추쌈 곁들이기']),
  e('돈가스', 'avoid', '튀김에 흰 빵가루와 단 소스라 열량과 정제 탄수화물이 많음', [P, C], ['소스 따로', '밥 반 공기']),
  e('비빔밥', 'often', '나물이 많아 식이섬유가 풍부함', [F, P], ['고추장 절반', '밥 반 공기']),
  e('김밥', 'weekly_max_1', '흰쌀밥이 대부분이라 정제 탄수화물이 많음', [C], ['한 줄만', '국물 곁들이기']),
  e('라면', 'avoid', '정제 밀가루 면과 나트륨이 많고 채소가 거의 없음', [C, F], ['면 절반', '채소 추가']),
  e('칼국수', 'weekly_max_1', '밀가루 면이 주식이라 혈당이 빨리 오름', [C], ['면 절반', '김치 곁들이기']),
  e('쌀국수', 'weekly_max_1', '쌀면이 주식이라 정제 탄수화물이 많음', [C], ['면 절반', '숙주 많이']),
  e('회덮밥', 'often', '생선과 채소가 많아 열량이 낮음', [P, F], ['초장 절반', '밥 반 공기']),
  e('생선구이 정식', 'often', '구운 생선과 반찬이라 열량이 적당함', [P], ['밥 반 공기', '나물 반찬 위주']),
  e('백반', 'often', '여러 반찬으로 채소를 고루 먹을 수 있음', [F], ['밥 반 공기', '나물 반찬 위주']),
  e('닭가슴살 샐러드', 'often', '채소와 살코기라 열량이 낮고 식이섬유가 많음', [P, F], ['드레싱 따로', '견과 토핑 빼기']),
  e('샌드위치', 'weekly_max_1', '흰 빵이라 정제 탄수화물이 많음', [C], ['통밀빵으로', '치즈 빼기']),
  e('짜장면', 'avoid', '밀가루 면과 단 기름진 소스라 열량과 당이 높음', [P, C], ['면 절반']),
  e('짬뽕', 'weekly_max_1', '밀가루 면과 기름진 국물이라 열량이 높음', [P, C], ['면 절반', '국물 덜 먹기']),
  e('볶음밥', 'weekly_max_1', '기름에 볶은 흰쌀밥이라 열량과 정제 탄수화물이 많음', [P, C], ['반 그릇', '채소 추가']),
  e('국밥', 'often', '국물 위주라 밥을 따로 받아 양을 줄이기 쉬움', [P], ['밥 따로 반만', '깍두기 적게']),
  e('포케', 'often', '생선과 채소가 많아 열량이 낮고 식이섬유가 있음', [P, F], ['현미밥으로', '소스 절반']),
  e('삼겹살', 'weekly_max_1', '지방이 많은 부위라 열량이 높음', [P], ['쌈 채소 많이', '밥은 반 공기']),
  e('치킨', 'avoid', '튀김이라 열량이 높음', [P], ['구운 치킨으로', '반 마리만']),
  e('피자', 'avoid', '흰 밀가루 도우와 치즈라 열량과 정제 탄수화물이 많음', [P, C], ['한두 조각만']),
  e('떡볶이', 'avoid', '떡과 단 양념이라 정제 탄수화물과 당이 많음', [C], ['반 인분', '어묵 위주']),
  e('보쌈', 'weekly_max_1', '삶은 고기라 튀김보다 낫지만 지방이 많음', [P], ['쌈 채소 많이', '살코기 위주']),
  e('샤브샤브', 'often', '채소를 많이 먹고 기름 없이 익혀 열량이 낮음', [P, F], ['채소 먼저', '칼국수 사리 빼기']),
  e('연어덮밥', 'often', '생선 단백질이 많고 열량이 적당함', [P], ['밥 반 공기', '소스 절반']),
  e('불고기 정식', 'weekly_max_1', '단 양념 고기라 당과 열량이 높음', [P, C], ['밥 반 공기', '쌈 채소 곁들이기']),
  e('우동', 'weekly_max_1', '밀가루 면이 주식이라 정제 탄수화물이 많음', [C], ['면 절반', '튀김 고명 빼기']),
  e('파스타', 'avoid', '흰 밀가루 면과 크림·치즈 소스라 열량과 정제 탄수화물이 많음', [P, C], ['토마토 소스로', '면 절반']),
];

// F. 외식 메뉴가 적어 규칙상 식단표를 만들 수 없는 프로필 (tasks.md B15 T11). 배포본 사용자 프로필의 모양만 본떴다(메뉴 이름은 다름).
// 평일 점심 외식 2개(1개 주 1회), 평일 저녁 외식 3개(1개 주 1회, 1개는 점심과 같은 이름), 주말 집밥.
// 같은 메뉴 허용 횟수를 늘려도 바로 앞 끼니·같은 끼니 전날 금지 때문에 불가능하고, 평일 점심이나 저녁에 메뉴 하나만 더 있으면 가능하다(화요일 점심 일정이 있을 때. 일정이 없으면 점심 메뉴를 더해야 한다)
export const profileF: Profile = {
  userId: 'user-f',
  version: 1,
  goals: ['weight_loss', 'cholesterol'],
  goalNote: '',
  medication: 'none',
  avoid: ['fish', 'shellfish'],
  avoidNote: '',
  meals: [
    { dayType: 'weekday', meal: 'breakfast', place: 'skip', companions: 'alone' },
    { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'others', menus: ['샐러드', '주먹밥'] },
    { dayType: 'weekday', meal: 'dinner', place: 'eat_out', companions: 'alone', menus: ['샐러드', '덮밥', '토스트'] },
    { dayType: 'weekend', meal: 'breakfast', place: 'skip', companions: 'family' },
    { dayType: 'weekend', meal: 'lunch', place: 'home', companions: 'family' },
    { dayType: 'weekend', meal: 'dinner', place: 'home', companions: 'family' },
  ],
  consentedAt: CREATED,
  updatedAt: CREATED,
};

export const classesF: MenuClassification[] = [
  e('샐러드', 'often', '채소가 많아 열량이 낮고 식이섬유가 많음', [P, F], ['드레싱 따로']),
  e('주먹밥', 'weekly_max_1', '흰쌀밥이 대부분이라 양 조절이 필요함', [P], ['하나만']),
  e('덮밥', 'often', '밥 양만 줄이면 한 끼로 적당함', [P], ['밥 반 공기', '두부나 닭가슴살 토핑']),
  e('토스트', 'weekly_max_1', '버터와 단 소스로 포화지방이 많음', [P, 'reduce_saturated_fat'], ['버터 빼기']),
];

// G. 외식 메뉴가 적지만 같은 메뉴 허용 횟수를 늘리면 가능한 프로필 (B15 T11). 평일 점심 외식 2개(둘 다 자주), 평일 저녁 집밥.
// 평일 점심 5칸을 두 메뉴로 번갈아 채우면 한 메뉴가 3번이라 같은 메뉴를 주 3번까지 허용해야 한다
export const profileG: Profile = {
  userId: 'user-g',
  version: 1,
  goals: ['weight_loss'],
  goalNote: '',
  medication: 'none',
  avoid: [],
  avoidNote: '',
  meals: mealsWith(['비빔밥', '칼국수'], 30),
  consentedAt: CREATED,
  updatedAt: CREATED,
};

export const classesG: MenuClassification[] = [
  e('비빔밥', 'often', '채소가 많아 같은 양에 열량이 낮음', [P], ['고추장 절반']),
  e('칼국수', 'often', '국물 위주라 면 양만 줄이면 열량이 적당함', [P], ['면 절반']),
];
