# 식단 코치 에이전트 스펙 (첫 시연, 초안 v2)

기획서 `docs/diet-coach-agent-screener.md`를 구현하기 위한 스펙이다. 기획서가 "무엇을 왜"를 정했다면, 이 문서는 데이터 모양, 단계별 입출력, 테스트 기준을 정한다.

v2 변경: 스펙 리뷰 반영. 끼니별 외식 메뉴 목록, `checkPlan` 시그니처와 위반 형식 확정, 점검 요약을 별도 포맷터로 분리, 테스트 케이스별 픽스처 변경 명시.

## 0. 범위

**첫 시연에 포함:**

- 인터뷰로 프로필 만들기 (필수 질문 3개 + 조건부 질문)
- 식단 기준을 정하고 확인받기
- 외식 메뉴를 분류하고 확인받기
- 1주일 식단표를 이유와 함께 만들기
- 규칙 점검, 걸린 칸 다시 추천
- 특정 칸을 바꿔 달라는 요청에 그 칸만 다시 추천하기
- 프로필 저장과 불러오기, 식단표 저장
- 지원 목표: 감량, 혈당 관리, 콜레스테롤 관리와 그 조합
- 끼니 장소: 거름, 외식, 집밥 (도시락은 첫 시연 이후)
- React 화면 5개: 인터뷰, 프로필 확인, 기간 선택, 메뉴 분류 확인, 식단표 (7장). 같은 Worker에서 함께 배포한다 (7.1)

**첫 시연 이후:** 하루 재조정, 레시피, 지난주 체크 반영, 근육 증가 목표, 도시락

**처리 원칙:** 결과를 보장해야 하는 일은 코드가, 판단과 문장은 LLM이 맡는다.

| 단계 | 담당 |
| --- | --- |
| 인터뷰 진행, 답 해석 | LLM |
| 다음 질문 정하기, 범위 밖 분기 | 코드 (LLM이 뽑은 값과 플래그로 판단) |
| 식단 기준 정하기 (목표 → 기준) | 코드 (기준 테이블 조회) |
| 외식 메뉴 분류 | LLM |
| 끼니 배치, 재료 태그, 이유 | LLM (구조화된 출력) |
| LLM 출력 형식 검증과 정규화 | 코드 |
| 규칙 점검 | 코드 |
| 점검 요약 문구 | 코드 (포맷터) |
| 저장과 불러오기 | 코드 |

## 1. 데이터 스키마

TypeScript로 적는다. 모든 LLM 출력은 스키마 검증기(zod 등)로 검증하고, 맞지 않으면 다시 요청한다(최대 2회).

### 1.1 기본 값

선언 순서가 정렬 순서로 쓰이므로, 아래 유니언의 순서를 바꾸지 않는다.

```ts
type GoalId = "weight_loss" | "blood_glucose" | "cholesterol";

type CriterionId =
  | "reduce_portion_calories"   // 양과 열량 줄이기
  | "reduce_refined_carbs"      // 정제 탄수화물 줄이기
  | "reduce_saturated_fat"      // 포화지방 줄이기
  | "increase_fiber";           // 식이섬유 늘리기

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DayType = "weekday" | "weekend";
type MealType = "breakfast" | "lunch" | "dinner";
type MealPlace = "skip" | "eat_out" | "home";

// 피할 음식 태그 (알레르기, 식이 제한)
type AvoidTag =
  | "dairy" | "egg" | "wheat" | "soy" | "peanut" | "tree_nut"
  | "fish" | "shellfish" | "meat" | "pork" | "beef" | "chicken";

// 영양 특성 태그 (기준 점검용)
type NutritionTag =
  | "fried"             // 튀김
  | "fatty_meat"        // 삼겹살, 차돌 등 기름진 고기
  | "processed_meat"    // 햄, 소시지
  | "refined_carb_main" // 흰 면, 흰 빵이 주식인 메뉴
  | "sugary";           // 단 소스, 디저트

type Tag = AvoidTag | NutritionTag;

type Slot = { day: Day; meal: MealType };
```

**도우미 함수 (코드):**

```ts
dayType(day: Day): DayType            // sat, sun → "weekend", 나머지 → "weekday"
slotOrder(slot: Slot): number         // 요일(mon→sun) × 끼니(breakfast→dinner) 순서. 0~20
expandAvoid(avoid: AvoidTag[]): Set<AvoidTag>
// "meat"가 있으면 "pork", "beef", "chicken"을 더한다. 다른 태그는 그대로.
```

LLM에는 "고기가 들어가면 `meat`와 구체적인 고기 태그를 함께 붙인다"고 지시한다. 점검은 `expandAvoid`로 펼친 집합과 비교하므로, LLM이 `pork`만 붙여도 `meat`를 피하는 사용자에게서 걸린다.

### 1.2 프로필

```ts
interface MealSetting {
  dayType: DayType;
  meal: MealType;
  place: MealPlace;
  companions: "alone" | "family" | "others"; // 기본값 "alone". 점검에는 쓰지 않음
  menus?: string[];       // place === "eat_out"이면 필수, 1개 이상
  cookMinutes?: number;   // place === "home"일 때 선택. 없으면 시간 제한 없음
}

type Medication = "none" | "glucose" | "cholesterol" | "other";

interface Profile {
  userId: string;
  version: number;            // 저장할 때마다 1씩 증가
  goals: GoalId[];            // 1개 이상, 중복 없음
  goalNote: string;           // 사용자 원문 ("체중 5kg 감량, 콜레스테롤 관리")
  medication: Medication;     // 혈당·콜레스테롤 목표가 없으면 "none"
  avoid: AvoidTag[];
  avoidNote: string;          // 사용자 원문 ("우유를 마시면 배가 아파요")
  meals: MealSetting[];       // (dayType × meal) 6개 조합이 정확히 한 번씩
  consentedAt: string;        // 민감정보 저장 동의 시각 (ISO 8601)
  updatedAt: string;
}
```

- 식단 기준은 프로필에 저장하지 않는다. 필요할 때마다 `buildCriteria(profile.goals)`로 계산한다. 이렇게 하면 화면에 보이는 기준과 점검에 쓰는 기준이 어긋나지 않는다.
- `medication`이 `"glucose"`면 식단표를 만들지 않는다(4.1). `"cholesterol"`이면 식단표를 만들되, 식단표 화면에 "약을 드시는 중이라면 식단 변경을 담당 의사와 상의하세요" 안내를 추가한다. `"other"`도 같다.

**프로필 검증 (코드):** `meals`가 6개 조합을 빠짐없이 한 번씩 가짐, 외식 끼니는 `menus`가 1개 이상, `goals`가 비지 않음, 동의 시각이 있음.

`validateProfile(profile): ProfileIssue[]`(`core/profile-validation.ts`)는 에러를 던지지 않고 문제 목록을 돌려준다. 비어 있으면 통과다. `ProfileIssue`는 `{ code, meal?: { dayType, meal } }`이고, code는 아래 순서로 정렬된다. 같은 code 안에서는 끼니 순서(평일 아침 → 주말 저녁)를 따른다.

| code | 판정 |
| --- | --- |
| `goals_empty` | `goals`가 비었음 |
| `goals_duplicate` | `goals`에 중복이 있음 |
| `meal_missing` | 6개 조합 중 빠진 끼니마다 |
| `meal_duplicate` | 두 번 이상 나온 끼니마다 |
| `menus_required` | 외식 끼니에 `menus`가 없거나, 공백을 뺀 값이 모두 비었음 |
| `medication_without_goal` | 혈당·콜레스테롤 목표가 없는데 `medication`이 `"none"`이 아님 |
| `consent_missing` | `consentedAt`이 비었음 |

### 1.3 외식 메뉴 분류

분류 대상은 모든 외식 끼니의 `menus`를 합친 뒤 중복을 뺀 목록이다.

```ts
type MenuClass = "often" | "weekly_max_1" | "avoid";

interface MenuClassification {
  menu: string;          // 분류 대상 목록의 문자열과 정확히 같아야 함
  class: MenuClass;
  reason: string;
  criterionIds: CriterionId[];  // 근거가 된 기준
  orderTips: string[];          // "국물 남기기", "소스 따로"
}
```

### 1.4 식단표

```ts
interface PlanCell extends Slot {
  place: "eat_out" | "home";
  menuId: string;          // 같은 메뉴 판정용 (아래 규칙 참조)
  title: string;           // 화면 표시용 ("회덮밥 (초장 절반)")
  ingredients: string[];
  tags: Tag[];
  orderTip?: string;       // 외식일 때
  cookMinutes: number;     // 집밥일 때 필수, 외식이면 0
  reason: string;          // 한두 문장
  criterionIds: CriterionId[];  // reason의 근거. 1개 이상
}

interface Plan {
  planId: string;
  userId: string;
  profileVersion: number;  // 이 식단표를 만들 때 쓴 프로필 버전
  weekStart: string;       // 해당 주 월요일 (YYYY-MM-DD)
  events: (Slot & { note: string })[];  // 회식, 약속. 이 끼니에는 칸을 두지 않음
  cells: PlanCell[];
  createdAt: string;
}
```

**`menuId` 규칙:**

- 외식 칸의 `menuId`는 그 끼니 설정의 `menus` 중 하나와 정확히 같은 문자열이다. "백반 (생선 반찬)"처럼 설명이 붙은 이름은 `title`에만 쓴다.
- 집밥 칸의 `menuId`는 설명을 뺀 메뉴 이름이다 ("두부 채소 볶음").
- 정규화(앞뒤 공백 제거, 괄호 설명 제거)는 LLM 출력 검증 단계에서 한다. 외식 메뉴 목록과 분류는 정확히 일치하는지로 비교한다.
- **같은 메뉴인지** 판정할 때(`consecutive_menu`, `same_meal_consecutive_days`, `menu_weekly_limit`)는 `menuKey(menuId)`(공백을 모두 뺀 값)로 비교한다. "닭가슴살 채소 볶음"과 "닭가슴살 채소볶음"은 같은 메뉴다.

### 1.5 점검 결과

```ts
// 선언 순서가 위반 목록의 정렬 순서다
type RuleId =
  | "unexpected_cell"      // 칸이 있으면 안 되는 끼니에 칸이 있음, 또는 같은 끼니에 칸이 2개 이상
  | "missing_cell"         // 채워야 할 끼니가 빠짐
  | "avoid_tag"            // 피할 음식 태그가 들어감
  | "eat_out_not_in_list"  // 외식 칸이 그 끼니의 메뉴 목록에 없음
  | "class_avoid"          // "피하기" 메뉴를 배치함
  | "class_weekly_limit"   // "주 1회 이하" 메뉴를 2회 이상 배치함
  | "tag_weekly_limit"     // 기준별 태그 횟수 제한을 넘음
  | "consecutive_menu"     // 같은 메뉴가 연속됨
  | "same_meal_consecutive_days" // 같은 끼니, 연속된 요일에 같은 메뉴
  | "menu_weekly_limit"    // 같은 메뉴 주 2회 초과
  | "cook_time_exceeded"   // 집밥 조리 시간 초과
  | "reason_criterion";    // 이유의 근거가 식단 기준에 없음

interface Violation {
  rule: RuleId;
  cells: Slot[];        // 위반에 관련된 칸 전부, 시간순
  regenerate: Slot[];   // 다시 추천할 칸, 시간순. 비어 있으면 코드가 그 칸을 지움
  detail?: string;      // 규칙별 부가 정보 (태그 이름, 메뉴 이름). 테스트에서 비교함
}

interface CheckStats {
  avoidTagCounts: Partial<Record<AvoidTag, number>>;   // 프로필 avoid(펼친 집합)의 태그별 횟수
  limitedMenuCounts: Record<string, number>;           // weekly_max_1 메뉴별 횟수 (외식 칸)
  limitedTagCounts: Partial<Record<NutritionTag, number>>; // 제한이 있는 태그별 횟수
  consecutiveCount: number;                            // consecutive_menu + same_meal_consecutive_days 위반 수
}

interface CheckResult {
  passed: boolean;          // violations가 비었는지
  violations: Violation[];
  stats: CheckStats;        // 통과 여부와 관계없이 항상 채움
}
```

사용자에게 보여 줄 문장은 `checkPlan`이 만들지 않는다. 6장의 포맷터가 `stats`로 만든다.

## 2. 기준 테이블

목표에서 기준을 정하는 일은 LLM이 아니라 코드가 이 테이블을 조회해서 한다.

| 목표 | 기준 | 태그 제한 (주당 최대) |
| --- | --- | --- |
| 감량 | 양과 열량 줄이기 | `fried` 1, `sugary` 1 |
| 혈당 관리 | 정제 탄수화물 줄이기, 식이섬유 늘리기 | `refined_carb_main` 2, `sugary` 0 |
| 콜레스테롤 관리 | 포화지방 줄이기, 식이섬유 늘리기 | `fried` 1, `fatty_meat` 1, `processed_meat` 0 |

> 태그 제한 값은 확정이다 (2026-11-07, 열린 질문 1). 공식 지침에는 "주당 최대 횟수"가 없고 방향만 있어서, 아래 근거의 방향을 1주일 식단표에 옮긴 제품 결정이다.
>
> - `processed_meat` 0: IARC가 가공육을 1군 발암물질로 분류, WCRF "먹더라도 아주 조금", AHA(2026) 가공육 최소화
> - `fatty_meat` 1: 포화지방을 열량의 10% 미만으로(AHA, 국내 소개는 7%), 적색육은 주 3회(조리 후 350~500g) 이하(WCRF)
> - `fried` 1: 횟수 근거는 없다. "덜 기름지게"(2016 국민 공통 식생활지침), 초가공식품 줄이기(AHA)
> - `sugary` 감량 1, 혈당 0: 유리당을 열량의 10% 미만(가능하면 5%)으로(WHO), 당뇨는 단순당 주의와 가당음료를 물로 대체(대한당뇨병학회, ADA)
> - `refined_carb_main` 2: 정제 곡류 최소화(ADA). 정의는 흰 면·흰 빵이 주식인 메뉴이고 흰쌀밥은 넣지 않는다. 국내 자료에 "쌀밥과 잡곡밥은 양이 더 중요하다"는 입장이 있고, 한국 직장인 외식의 대부분이 쌀밥이라 넣으면 식단이 성립하지 않는다(사용자 결정, 2026-11-07)

```ts
interface CriteriaRules {
  criteria: CriterionId[];                          // CriterionId 선언 순서, 중복 없음
  tagLimits: Partial<Record<NutritionTag, number>>; // 테이블에 나온 태그만 키로 가짐
}

buildCriteria(goals: GoalId[]): CriteriaRules
```

- 목표가 여러 개면 기준은 합집합, 같은 태그의 제한은 더 작은 값을 쓴다.
- 중복된 목표는 하나로 본다.
- 목표가 비었거나 알 수 없는 값이 있으면 에러를 던진다.

## 3. 규칙 점검 (코드)

```ts
checkPlan(
  plan: Plan,
  profile: Profile,
  classes: MenuClassification[],
  rules: CriteriaRules,
): CheckResult
```

순수 함수이고, LLM을 부르지 않는다. 프로필과 식단표가 1장의 스키마 검증을 통과했다고 가정한다.

### 3.1 준비

- **채워야 할 끼니:** 7일 × 3끼니 중 `meals`에서 `place !== "skip"`이고 `events`에 없는 끼니
- **시간순:** `slotOrder`로 정렬. 일요일 다음을 월요일로 다시 잇지 않는다.
- **이어진 칸:** 실제로 있는 칸을 시간순으로 정렬했을 때 바로 이웃한 두 칸. 거른 끼니, 일정이 있는 끼니, 빠진 칸은 건너뛰고 이어 본다.

### 3.2 규칙

위반 하나에 무엇이 들어가는지까지 정한다.

| 규칙 | 판정 | 위반 단위 | `regenerate` |
| --- | --- | --- | --- |
| `unexpected_cell` | 채워야 할 끼니가 아닌 곳의 칸, 또는 같은 끼니의 두 번째 이후 칸 | 칸마다 1개 | `[]` (코드가 지움) |
| `missing_cell` | 채워야 할 끼니에 칸이 없음 | 끼니마다 1개 | 그 끼니 |
| `avoid_tag` | 칸의 `tags`에 `expandAvoid(profile.avoid)`의 태그가 있음 | 칸마다 1개. `detail`은 걸린 태그들을 쉼표로 이은 값(AvoidTag 선언 순서) | 그 칸 |
| `eat_out_not_in_list` | 외식 칸의 `menuId`가 그 끼니 설정의 `menus`에 없음 | 칸마다 1개 | 그 칸 |
| `class_avoid` | 외식 칸의 `menuId`가 `avoid`로 분류됨 | 칸마다 1개 | 그 칸 |
| `class_weekly_limit` | `weekly_max_1` 메뉴가 외식 칸에 2회 이상 | 메뉴마다 1개. `detail`은 메뉴 이름 | 두 번째 이후 칸 |
| `tag_weekly_limit` | `rules.tagLimits`의 태그가 모든 칸 합산으로 제한을 넘음 | 태그마다 1개. `detail`은 태그 이름 | 제한 횟수 다음부터의 칸 (제한이 0이면 전부) |
| `consecutive_menu` | 이어진 두 칸의 `menuKey`가 같음 | 이어진 쌍마다 1개 | 뒤쪽 칸 |
| `same_meal_consecutive_days` | 같은 끼니(점심끼리, 저녁끼리)의 달력상 연속된 두 요일 칸의 `menuKey`가 같음. 한쪽 요일에 칸이 없으면(거름, 일정, 빠짐) 연속으로 보지 않는다. `consecutive_menu`가 볼 수 있는 이어진 칸 쌍은 건너뛴다(중복 보고 방지) | 쌍마다 1개 | 뒤쪽 칸 |
| `menu_weekly_limit` | 같은 `menuKey`가 모든 칸 합산으로 주 2회(외식 메뉴가 적으면 사전 점검이 늘린 값, 4.3 사전 점검)를 넘음. `weekly_max_1`·`avoid`로 분류된 메뉴는 더 엄격한 규칙이 맡으므로 제외 | 메뉴마다 1개. `detail`은 처음 나온 칸의 `menuId` | 세 번째 이후 칸 |
| `cook_time_exceeded` | 집밥 칸의 `cookMinutes`가 그 끼니 설정의 `cookMinutes`보다 큼. 설정에 값이 없으면 점검하지 않음 | 칸마다 1개 | 그 칸 |
| `reason_criterion` | 칸의 `criterionIds`가 비었거나 `rules.criteria`에 없는 값이 있음 | 칸마다 1개 | 그 칸 |

- `class_avoid`, `class_weekly_limit`은 외식 칸만 센다. 분류에 없는 메뉴는 이 두 규칙에서 무시한다(그런 메뉴는 `eat_out_not_in_list`에 걸린다).
- `unexpected_cell`로 걸린 칸은 다른 규칙의 점검과 통계에서 뺀다.

### 3.3 정렬

위반 목록은 `RuleId` 선언 순서로, 같은 규칙 안에서는 `cells[0]`의 시간순으로, 그것도 같으면 `detail`의 사전순으로 정렬한다.

## 4. 단계별 입출력

### 4.1 인터뷰

**입력 방식 (2026-11-06, B4):** 정해진 답(목표, 약, 피할 음식, 끼니별 장소·같이 먹는 사람, 외식 메뉴, 조리 시간)은 화면 입력(체크박스, 라디오, 끼니 표, 입력칸, 버튼)으로 받는다. 화면이 입력값으로 `InterviewUpdate`를 만들고(`core/interview-form.ts`) 단계마다 브라우저에서 `applyTurn`을 돌린다. 진행 상태는 화면의 `localStorage`(대화 ID별)에 둔다. 단계가 끝나면 `인터뷰 제출:` + JSON 메시지를 한 번 보내고, `submit_interview` 도구가 `useDelivery()`로 읽어 검증한 뒤 결과를 `usePersistentState('interviewResult')`에 저장한다.

- LLM은 목표 메모(`goalNote`)가 있을 때만 제출 시 1회 부른다(`core/interview-note.ts`, llama-4-scout). 메모에서 `stopFlags`, `turnFlags`, 무리한 목표일 때의 선택지를 찾는다. 피할 음식 메모는 해석하지 않고 저장만 한다.
- 중단 사유(임신, 신장 질환)는 목표 단계의 체크박스로 받는다. 당뇨약은 약 단계 답으로 분기 1이 처리한다.
- 서버가 목표를 다시 물으면(분기 2, 3) 도구 결과의 `state`와 `next`로 화면이 목표 단계부터 이어 간다.
- 매 턴 LLM이 답을 옮기는 방식은 재 보니 턴당 약 150~240 Neuron, 1~2.5분이라 쓰지 않는다 (11.5).

인터뷰 상태는 지금까지 채운 프로필 초안과 중단 플래그만 가진다. 다음에 물을 질문은 상태에 저장하지 않고 순수 함수로 계산한다.

```ts
interface InterviewState {
  draft: InterviewDraft;
  stopFlags: StopFlag[];    // 한 번 생기면 남음
  menuFollowUps: { dayType: DayType; meal: MealType }[]; // 메뉴가 적어 한 번 더 물어본 끼니 (분기 6)
}

// 프로필 초안. undefined는 아직 묻지 않음. avoid: []는 "없음"
// meals는 끼니(dayType, meal) 말고는 일부만 채워질 수 있고, cookMinutes: null은 "상관없다"
type InterviewDraft = Omit<Partial<Profile>, "meals"> & {
  meals?: (Partial<MealSetting> & { dayType: DayType; meal: MealType; cookMinutes?: number | null })[];
};

type InterviewField =
  | "goals" | "medication" | "avoid" | "meals"
  | { menusFor: { dayType: DayType; meal: MealType } }
  | { cookMinutesFor: { dayType: DayType; meal: MealType } };

type StopFlag = "pregnancy" | "kidney_disease" | "glucose_medication";

type TurnFlag =                // 그 턴에만 처리하고 버림
  | "extreme_restriction" | "unsupported_goal"
  | "asks_lab_interpretation" | "asks_medication_advice";

interface InterviewUpdate {   // 한 단계의 답. 화면 입력이나 목표 메모 확인 결과로 만든다
  filled: InterviewDraft;
  ambiguous?: { field: InterviewField; choices: string[] };
  stopFlags: StopFlag[];
  turnFlags: TurnFlag[];
}

nextField(draft: Partial<Profile>): InterviewField | null   // null이면 인터뷰 끝
```

**`nextField` 순서 (코드):**

1. `goals`
2. `medication`: `goals`에 혈당이나 콜레스테롤이 있을 때만. 없으면 `"none"`으로 채운다.
3. `avoid`
4. `meals`
5. 외식 끼니마다 `menusFor` (평일 아침 → 평일 점심 → … → 주말 저녁 순)
6. 집밥 끼니마다 `cookMinutesFor`. 사용자가 "상관없다"고 답하면 값 없이 넘어간다.

**턴마다 코드가 하는 분기:**

1. `stopFlags`가 있으면 식단표 만들기를 멈추고 전문가 상담 안내를 보여 준다. `medication === "glucose"`도 `glucose_medication`과 같게 처리한다.
2. `extreme_restriction`이면 그대로 따르지 않고 무리하지 않는 목표를 선택지로 다시 묻는다.
3. `unsupported_goal`(근육 증가 등)이면 첫 시연에서 지원하지 않는다고 알리고, 지원하는 목표 중에서 고르게 한다.
4. `asks_lab_interpretation`, `asks_medication_advice`면 다룰 수 없다고 답하고 인터뷰를 이어 간다.
5. `ambiguous`가 있으면 선택지를 보여 주고 같은 필드를 다시 묻는다.
6. 외식 끼니의 메뉴가 2개 이하면 한 번 더 받아 보고, 사용자가 거절하면 그대로 진행한다(주문 방법을 달리해 배치).
7. `nextField`가 `null`이면 `buildCriteria`로 기준을 계산하고 프로필 확인 화면으로 넘어간다.

**구현 세부 (`core/interview.ts`, `core/interview-turn.ts`):**

- `mergeDraft(draft, filled)`: `meals`는 `(dayType, meal)`끼리 필드 단위로 합치고 끼니 순서로 정렬한다. 나머지 필드는 덮어쓴다. `undefined` 값은 무시한다.
- `finishDraft(draft)`: 인터뷰가 끝난 초안을 프로필의 인터뷰 항목(`goals`, `goalNote`, `medication`, `avoid`, `avoidNote`, `meals`)으로 바꾼다. 혈당·콜레스테롤 목표가 없으면 `medication`을 `"none"`으로 두고, `cookMinutes: null`을 지우고, `companions`가 없으면 `"alone"`으로 둔다.
- `applyTurn(state, update) → { state, next, notices }`. 문구는 만들지 않는다.
  - `next`:
    - `{ kind: "stop", flags }`
    - `{ kind: "ask", field, reason?, choices? }`. reason은 `extreme_restriction`, `unsupported_goal`, `ambiguous`, `few_menus` 중 하나
    - `{ kind: "done", result, criteria }`
  - `notices`: `asks_lab_interpretation`, `asks_medication_advice`(분기 4)
- 분기 우선순위: 1 → 2 → 3 → 5 → 6 → 7. 분기 4는 어느 분기와도 함께 `notices`로 나온다.
  - 분기 2: 이번 턴의 `filled`는 버리고 지금 필드를 다시 묻는다. 선택지는 LLM의 `ambiguous.choices`를 쓴다.
  - 분기 3: `filled.goals`만 버린다. 선택지는 코드가 지원 목표 3개("체중 감량", "혈당 관리", "콜레스테롤 관리")로 고정한다.
  - 분기 5: 모호한 필드(끼니 필드면 그 끼니의 `menus`나 `cookMinutes`)만 빼고 반영한다.
  - 분기 6: 이번 턴에 메뉴를 받은 외식 끼니의 메뉴가 1~2개이고 `menuFollowUps`에 없으면 그 끼니를 기록하고 다시 묻는다.
- 문장은 코드 템플릿이다(`core/interview-text.ts`): 단계 제목(`questionText`), 다시 묻는 이유·중단·범위 밖 안내(`formatTurnReply`), 끝 요약(`summarizeInterviewResult`).
- 제출(`core/interview-runner.ts`의 `submitInterview`): 끝난 초안이 아니면 에러. 메모가 있으면 확인하고, 무리한 목표일 때만 선택지를 `ambiguous`로 넘겨 `applyTurn`을 돌린다. 결과는 `done | stop | ask | quota`.

### 4.2 외식 메뉴 분류 (LLM)

```ts
classifyMenus(profile: Profile, rules: CriteriaRules): MenuClassification[]
```

- 출력의 `menu`는 분류 대상 목록(1.3)과 1:1로 대응해야 한다. 빠지거나 추가되면 형식 오류로 보고 다시 요청한다.
- 사용자가 분류를 고치면 그 값을 그대로 쓴다.

**구현 세부 (B5):**

- 분류 대상(`classificationTargets`): 외식 끼니의 `menus`를 끼니 순서(평일 아침 → 주말 저녁)로 합치고, 앞뒤 공백을 지워 같은 문자열을 한 번만 남긴다. 외식 끼니가 없으면 LLM을 부르지 않고 빈 분류로 끝난다.
- 1:1 검사는 결과 스키마의 `v.check`로 한다(`agents/menu-schema.ts`). 맞지 않으면 Flue가 빠진·추가된·두 번 나온 메뉴를 적은 메시지로 다시 요청한다. 받은 뒤 코드가 한 번 더 확인하고(`normalizeClassifications`), 대상 순서로 정렬한다. 이번 기준에 없는 `criterionIds`는 다시 요청하지 않고 지운다.
- 모델은 gemma, `thinkingLevel: 'low'`(`models.ts`의 `menuClassModel`, `.dev.vars`의 `MENU_MODEL`로 바꿔 시험). B5는 llama-4-scout였지만, Workers AI 기본 출력 상한 256토큰에서 잘려 `finish`를 부르지 못하고 Flue 재요청이 반복돼 바꿨다(B6, 11.5). 배열 필드는 문자열 하나도 받는다. 메뉴 이름 앞뒤 공백은 떼고 1:1을 보며, `reason`이 null이거나 없으면 빈 문자열로 받는다(T9-3).
- 메뉴 분류 요청에는 기간 선택 화면의 일정을 싣는다: `메뉴 분류 요청:` + `{"events":[{day, meal, note}]}`(B6). 도구가 `validateEvents`(`core/period.ts`: 안 먹는 끼니·같은 칸·빈 메모·50자 초과·모든 끼니가 일정이면 `bad_request`)로 검증하고, 분류가 성공하면 `nextMondayKst`로 정한 시작일과 함께 `usePersistentState('period')`에 둔다(판단은 `core/classify-runner.ts`). `create_week_plan`은 이 기간과 일정으로 만들되, 저장한 시작일이 오늘(KST)이거나 지났으면 다음 월요일로 다시 정한다(`planWeekStart`, T9-4).
- 흐름: 인터뷰가 끝나면 화면이 `메뉴 분류 요청`을 보내고 `classify_menus` 도구가 끝난 인터뷰로 분류해 `usePersistentState('menuClasses')`에 저장한다. 분류 확인 화면에서 `식단표 만들기:` + `{"overrides":[{menu, class}]}` 메시지를 보내면 `create_week_plan`이 `useDelivery()`로 읽어 저장된 분류에 반영하고(`classesForPlan`), 반영한 분류를 다시 저장한 뒤 식단을 만든다. 칸 수정도 이 분류로 점검한다. 저장된 분류에 없는 메뉴로 온 수정은 무시한다.
- 사용자가 바꾼 메뉴는 `class`만 바꾸고 `reason`은 "직접 정한 분류"로 바꾼다. `orderTips`는 그대로 둔다.
- **이전 분류 재사용 (B16, 2026-11-08):** 분류 확인 화면의 "외식 메뉴 고치기"로 새 대화에서 다시 분류할 때, 요청에 이전 분류를 싣는다: `메뉴 분류 요청:` + `{"events":[…],"known":[MenuClassification]}`. `known`에 같은 이름(정확히 일치)이 있는 메뉴는 그 값을 쓰고 남은 메뉴만 모델에 보낸다. 모두 있으면 모델을 부르지 않는다. `criterionIds`는 지금 기준으로 거른다. `known`은 사용자가 분류 화면에서 마음대로 바꿀 수 있는 값과 같은 수준이라 받되, 100개·이유 300자·팁 5개(각 100자) 제한과 형식을 검증하고 틀리면 `bad_request`. 분류 요청은 그대로 종류별 하루 횟수에 센다.
- 분류가 없거나 지금 메뉴와 1:1이 아니면 `create_week_plan`은 LLM을 부르지 않고 `no_classes`를 돌려준다.
- 식단표의 프로필은 `profileFromInterview`로 만든다. 저장(T6) 전이라 `userId: 'demo'`, `version: 0`이다. `consentedAt`은 프로필 확인 화면에서 동의했으면 제출 시각, 아니면 `''`다(B6).

### 4.3 식단표 만들기 (LLM)

**사전 점검 (B15, 2026-11-08)**: LLM을 부르기 전에 `planFeasibility(profile, classes, events)`(`core/plan-feasibility.ts`)로 외식 칸에 규칙(같은 메뉴 허용 횟수, 주 1회 메뉴 1번, 피하기 메뉴 제외, 바로 앞 끼니·같은 끼니 전날 같은 메뉴 금지)을 지키는 배치가 있는지 본다. 집밥 칸은 메뉴가 자유라 항상 가능하다고 본다.
- 같은 메뉴 허용 횟수는 2부터 올려 처음 가능한 값을 쓴다(사용자 결정: 메뉴가 적으면 늘린다. 연속 금지와 주 1회 제한은 풀지 않는다). `checkPlan`, 생성·다시 추천 프롬프트, 식단표 안내("외식 메뉴가 적어 같은 메뉴를 1주일에 N번까지 넣었어요.")가 같은 함수로 같은 값을 계산한다(데이터 모양 변경 없음)
- 횟수를 늘려도 불가능하면 LLM을 부르지 않고 `status: 'infeasible'`, 메뉴 하나를 더 넣으면 가능해지는 끼니(`shortMeals`)와 "평일 점심 외식 메뉴가 적어 규칙에 맞는 식단표를 만들 수 없어요. 평일 점심에 외식 메뉴를 더 넣어 주세요." 안내. 다시 시도는 없다
- 배경: 배포본 사용자 프로필(평일 점심 4칸에 외식 2개, 저녁 5칸에 3개, 각 1개 주 1회)은 규칙을 지키는 식단표가 없었고, 모델이 5~6분 추론하다 실패했다(tasks.md T11)

1주일 칸 전체를 **한 번의 호출**로 만든다(10장 7번). Flue `harness.prompt(text, { result: 스키마 })`로 받고, 프롬프트에는 3.2의 다양성 규칙(같은 끼니 연속 요일 금지, 같은 메뉴 주 2회 이하)도 함께 적는다.

```ts
generatePlan(input: {
  profile: Profile;
  rules: CriteriaRules;
  classes: MenuClassification[];
  weekStart: string;
  events: Plan["events"];
}): PlanCell[]
```

LLM에는 칸(`cells`)만 받는다. `planId`, `userId`, `profileVersion`, `weekStart`, `events`, `createdAt`은 루프가 입력 값으로 채운다. LLM이 일정이나 날짜를 바꿔 점검을 비켜 가지 못하게 하려는 것이다.

### 4.4 점검과 다시 추천 루프

```ts
regenerateCells(input: {
  plan: Plan;
  targets: Slot[];
  violations: Violation[];   // 무엇 때문에 다시 짜는지
  userRequest?: string;      // 사용자가 직접 바꿔 달라고 한 경우
  profile: Profile;
  rules: CriteriaRules;
  classes: MenuClassification[];
}): PlanCell[]
```

1. `generatePlan` → `checkPlan`
2. 위반이 있으면:
   - `regenerate`가 빈 위반의 칸(`unexpected_cell`)은 코드가 지운다.
   - 나머지 위반의 `regenerate`를 모아 중복을 뺀 칸만 `regenerateCells`로 다시 만든다.
   - 다시 `checkPlan`을 돌린다.
3. 최대 3회 반복한다. 그래도 위반이 남으면 식단표를 보여 주지 않고 "조건을 모두 맞추기 어렵다"고 알린 뒤, 위반 원인(예: 외식 메뉴 부족)을 근거로 조건 완화를 묻는다.
4. 사용자가 칸 수정을 요청하면 그 칸을 `targets`로 같은 루프를 탄다. 3회 안에 통과하지 못하면 수정 전 식단표를 그대로 두고 바꾸지 못했다고 알린다.

구현 세부 (`src/core/plan-loop.ts`):

- "3회"는 `regenerateCells` 호출 횟수다. 새로 만들 때는 `generatePlan` 1번 + `regenerateCells` 최대 3번, 칸 수정은 사용자 요청 회차를 포함해 `regenerateCells` 최대 3번이다.
- `unexpected_cell` 칸 지우기는 LLM 호출이 아니라서 횟수로 세지 않는다. 같은 끼니에 칸이 여러 개면 `checkPlan`처럼 앞의 칸을 남긴다.
- `regenerateCells`가 돌려준 칸 중 `targets`가 아닌 칸은 버리고, 한 끼니에 여러 개면 첫 칸만 쓴다. 돌아오지 않은 칸은 비워 두어 다음 점검의 `missing_cell`로 다시 요청한다.
- 칸 수정에서 사용자 요청이 성공하면 위반을 고칠 기회는 2회 남는다.
- 칸 수정의 `userRequest`는 첫 회차와, 이후 회차 중 사용자가 고른 칸이 다시 대상이 된 회차에 보낸다. 고른 칸이 아닌 칸만 고치는 회차에는 보내지 않는다.
- 칸 수정은 채워야 할 끼니(3.1)만 고를 수 있다. 채우지 않는 끼니, 일정이 있는 끼니, 빈 요청은 LLM을 부르지 않고 `invalid_targets`로 거절한다.
- 칸 수정 전에 수정 전 식단표를 지금 조건(프로필, 메뉴 분류, 기준)으로 `checkPlan`한다. 위반이 있으면(조건이 바뀐 뒤의 식단표) LLM을 부르지 않고 `stale_plan`으로 거절하고 새로 만들라고 안내한다. 고르지 않은 칸의 기존 위반을 칸 수정이 떠안지 않게 하려는 것이다 (2026-11-06 결정). `invalid_targets`가 먼저다.
- 화면에서 칸 수정은 정해진 형식의 메시지(`칸 다시 추천: 화요일 점심` / `원하는 점: …`, `src/core/edit-request.ts`)로 보낸다. `edit_plan_cells` 도구는 칸과 요청을 모델에게 받지 않고 `useDelivery()`로 메시지를 직접 해석한다. 고칠 식단표는 에이전트 상태(`usePersistentState('plan')`)에 둔다.
- 칸 수정이 성공하면 `changed`(수정 전과 달라진 칸)와 `unchangedTargets`(고른 칸 중 메뉴가 그대로인 칸)를 돌려준다. 사용자가 고르지 않은 칸이 바뀌었거나 요청이 반영되지 않았으면 화면에서 알린다.
- 새로 만들기가 위반으로 실패하면 식단표는 보여 주지 않지만, 평가 세트와 디버깅을 위해 마지막 시도(`lastPlan`)를 결과에 남긴다.
- 루프는 입력 식단표를 고치지 않고, 성공한 LLM 호출의 토큰 사용량(`usages`)을 함께 돌려준다. 한도 초과가 아닌 에러는 그때까지의 `usages`를 붙인 `PlanLoopError`로 던진다. 호출자는 실패한 경우에도 이 사용량을 안전선(11.4-3)에 더한다.
- **도구 전체 시간 예산 (T8-4):** 만들기 10분, 칸 수정 5분(`core/llm-timeout.ts`의 `PLAN_TOOL_BUDGETS`). 루프는 호출마다 남은 시간을 제한으로 넘기고, 구현은 호출별 상한(생성 8분, 다시 추천 4분)과 짧은 쪽을 쓴다. 남은 시간이 `MIN_REGENERATE_MS`(2분)보다 적으면 다시 추천을 새로 부르지 않고 지금 결과로 끝낸다(위반이면 `violations`, 결과에 `stoppedForTime: true`). 남은 예산으로 줄여 건 다시 추천이 시간 초과로 끝나도 같게 처리한다. 예산이 남았는데 호출별 상한에 걸린 시간 초과는 `timeout`이다. 칸 수정의 첫 호출(사용자 요청)은 남은 시간과 관계없이 부른다. 값은 B11 실측 뒤 다시 맞춘다.
- **재시작 뒤 이어 가기 (B12):** 식단 도구 2개(`create_week_plan`, `edit_plan_cells`)는 Flue durable 도구다. LLM 호출은 호출 순번 이름(`llm:1`, `llm:2`…)의 `step.do`로 감싸고(`core/stepped-generator.ts`), planId·만든 시각·주 시작·예산 시작 시각은 `start` step, D1 저장은 `persist` step에 둔다. Durable Object가 재시작되면 끝난 step은 기록값을 돌려주고 끊긴 호출부터 다시 부른다. 예산은 `start`의 시각부터 재므로 복구가 있어도 도구 전체 예산을 넘지 않는다. 에이전트 상태 쓰기(`savePlan` 등)는 도구 결과와 함께 커밋되므로 step 밖에 둔다. 제출 하나의 복구 한도는 3회·20분(`SUBMISSION_DURABILITY`).

## 5. 저장 (Cloudflare)

```ts
interface Storage {
  getProfile(userId: string): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<Profile>;   // 저장된 version + 1로 저장하고 그 값을 돌려줌. 넘긴 version은 무시
  // getLatestPlan은 가장 나중에 저장한 식단표를 돌려준다.
  deleteUser(userId: string): Promise<void>;         // 프로필과 식단표 모두 삭제
  savePlan(plan: Plan): Promise<void>;
  getLatestPlan(userId: string): Promise<Plan | null>;
}
```

- 첫 시연 저장소 저장소는 D1(테이블 `profiles`, `plans`)이다. 구현은 이 인터페이스 뒤에 숨기고, 테스트에서는 메모리 구현을 쓴다.
- **D1 구현 (T6-1):** `storage/d1-storage.ts`, 테이블은 `migrations/0001_init.sql`. 조회에 쓰는 값(`user_id`, `version`, `seq`)만 열로 두고 본문은 JSON으로 둔다. 가장 나중 식단표는 `seq`(저장 순서)로 가린다. 버전 증가는 `INSERT … ON CONFLICT … RETURNING` 한 문장이라 동시에 저장해도 겹치지 않는다. `deleteUser`는 한 트랜잭션(`batch`)이다. 계약 테스트는 wrangler `getPlatformProxy`의 로컬 D1로 돈다. 에이전트·화면 연결은 T6-2(B9).
- 사용자 구분은 첫 시연에서 추측하기 어려운 고유 링크 토큰으로 한다. 로그인은 이후에 붙인다 (열린 질문 2).
- `consentedAt` 없이 `saveProfile`을 부르면 에러를 던진다.
- **서버 저장 (T6-2, B9):** 동의한 사용자만 D1에 남긴다(`storage/persist.ts`). 인터뷰 제출이 동의면 `saveProfile`(버전 +1), 동의하지 않으면 `deleteUser`로 그 사용자의 프로필과 식단표를 지운다. 식단표는 만들기·칸 수정이 성공했을 때 동의한 프로필이 있으면 새 행으로 저장한다(`userId`, `profileVersion`은 저장된 프로필 기준, 같은 `planId`도 새 행). 사용자 ID는 대화 ID `<userId>-…`에서 얻는다(에이전트 `props.id`). 저장 실패는 도구 결과를 깨지 않고 경고 로그만 남긴다.
- **불러오기·지우기:** `GET /api/profile`(토큰 필요)이 저장한 프로필을 인터뷰 결과 모양 `{ result }`나 `null`로 돌려주고, 첫 화면 분기가 쓴다. `DELETE /api/profile`은 `deleteUser`다("저장한 내 정보 지우기").
- **서버에 남는 대화 기록 (결정, B9):** 동의와 상관없이 에이전트 대화(Durable Object)에 인터뷰 제출 메시지, `interviewResult`, 분류, 식단표가 남는다. 첫 배포는 프로필 확인 화면의 저장 동의 설명에 "입력한 내용과 만든 식단표는 대화 기록으로 서버에 남는다"고 안내만 한다. 대화는 토큰의 사용자만 읽을 수 있다(11.4-1). 대화 기록 지우기는 tasks.md "나중에".
- **브라우저 저장 (B6, 리뷰 반영, B9):** 프로필은 더 이상 브라우저에 두지 않는다(B8까지의 `diet-coach:profile`은 처음 열 때 지운다). 브라우저에는 대화 ID, 토큰, 대화별 진행 값(인터뷰 답, 일정, 고르던 분류)만 있고, 진행 값은 그 단계가 끝나거나 새 대화로 넘어가면 지운다. "저장한 내 정보 지우기"는 서버의 프로필·식단표와 대화 ID·토큰을 뺀 `diet-coach:*`를 지운다(`ui/browser-store.ts`).

## 6. 점검 요약 포맷터 (코드)

```ts
formatCheckSummary(stats: CheckStats, profile: Pick<Profile, 'avoid'>): string[]
```

통과한 식단표 아래에 보여 줄 문장을 만든다. 줄 구성:

1. 피할 음식: 사용자가 고른 `avoid` 태그(펼친 태그 제외)를 AvoidTag 선언 순서로 "유제품 0회, 달걀 0회"처럼 한 줄에 잇는다. 피할 음식이 없으면 이 줄을 뺀다.
2. 주 1회 이하 메뉴: 배치된 메뉴가 있으면 식단표에 처음 나온 순서로 "주 1회 이하 메뉴: 돈가스 1회, 국밥 1회", 없으면 이 줄을 뺀다. `checkPlan`은 `limitedMenuCounts`에 칸의 시간순으로 키를 넣는다.
3. 같은 메뉴 연속: "같은 메뉴 연속 없음", 연속이 있으면 "같은 메뉴 연속 N회"

| AvoidTag | 라벨 | AvoidTag | 라벨 |
| --- | --- | --- | --- |
| dairy | 유제품 | fish | 생선 |
| egg | 달걀 | shellfish | 갑각류·조개류 |
| wheat | 밀 | meat | 고기 |
| soy | 콩 | pork | 돼지고기 |
| peanut | 땅콩 | beef | 소고기 |
| tree_nut | 견과류 | chicken | 닭고기 |

## 7. 화면

| 화면 | 내용 | 다음 |
| --- | --- | --- |
| 인터뷰 | 단계별 입력(목표·약·피할 음식·끼니 표·메뉴·조리 시간). 메모가 무리한 목표면 목표 단계로 돌아가 선택지를 보여 줌. 새로고침해도 이어짐 | 프로필 확인 |
| 프로필 확인 | 프로필 표, 식단 기준, 항목별 수정, 저장 동의 | 기간 선택 |
| 기간 선택 | 1주일(첫 시연은 이것만), 정해진 일정 입력 | 메뉴 분류 확인 |
| 메뉴 분류 확인 | 분류 표, 분류 바꾸기. (B16) 외식 끼니별로 묶고 머리에 "평일 저녁 · 5끼 · 쓸 수 있는 메뉴 3개(주 1회 1개)". 메뉴가 모자란 끼니는 경고 테두리와 "이렇게 하면 만들 수 있어요"(자주로 바꾸면 되는 메뉴는 누르면 바로 바뀜, 메뉴를 하나 더 넣을 끼니). "외식 메뉴 고치기"는 지금 프로필·일정·분류를 채운 새 대화의 프로필 확인 화면으로 가고, 메뉴 "고치기"는 이전 메뉴를 입력란에 미리 채운다 | 식단표 |
| (B15) 미리 알림 | 프로필 확인: 모든 메뉴를 자주로 보고도 불가능하면 메뉴를 더 넣으라는 안내(막지 않음). 메뉴 분류 확인: 바꾼 분류와 일정으로 불가능하면 4.3과 같은 문구를 띄우고 만들기 버튼을 막음 | – |
| 식단표 | 요일 × 끼니 표, 칸마다 이유와 주문 팁, 점검 요약, 의료 조언 아님 안내(약 복용 중이면 상담 권고 추가), 고른 주가 이미 시작해 다음 주로 만들었으면 맨 앞에 "고른 주(11/9~)가 이미 시작돼 다음 주(11/16~)로 만들었어요."(일정이 있으면 "일정은 같은 요일·끼니에 넣었어요." 덧붙임, T10-5), 칸별 "다시 추천" | 저장 |

저장된 프로필이 있으면 첫 화면은 "지난 프로필로 시작 / 바뀐 항목 고치기" 선택이다.

**구현 (B6):**

- 프로필 확인은 인터뷰 단계가 끝난 뒤, 제출 전에 화면에서 한다. 항목별 "고치기"는 그 항목만 초안에서 비우고(`core/profile-edit.ts`의 `reopenSection`) 그 단계를 다시 묻는다. 다 답하면 확인 화면으로 돌아온다. 식단 기준은 `buildCriteria` 결과를 `criteriaText`로 보여 준다.
- 저장 동의는 선택이다. 제출 메시지의 `consent: true`면 도구가 서버 시각으로 `consentedAt`을 채운다. 동의한 프로필은 서버 D1에 저장하고, 동의하지 않고 진행하면 서버에서 지운다(5장, B9).
- 첫 화면 분기: 새 대화이고 저장한 프로필이 있으면 "지난 프로필로 시작"(바로 제출) / "바뀐 항목 고치기"(확인 화면부터) / "인터뷰 처음부터" / "저장한 프로필 지우기".
- 기간 선택: "다음 주 월~일" 한 가지와 정해진 일정(요일 + 안 먹는 끼니가 아닌 끼니 + 메모). 일정 칸은 식단표에 "일정"으로 보인다.
- 저장 동의 기본값은 "바뀐 항목 고치기"를 고른 직후에만 체크한다. "지난 프로필로 시작"은 계속 동의한 것으로 보고 보낸다(첫 화면에 그렇다고 적음).
- 식단표 만들기가 실패하면(규칙 위반, 한도 초과, 시간 초과, 에러) "다시 시도"가 같은 대화에 같은 만들기 메시지(바꾼 분류 포함)를 다시 보낸다. 인터뷰와 분류는 다시 하지 않는다.
- 도구는 실패해도 에러를 던지지 않고 결과(`timeout`, `error` 등)로 답하며 턴을 끝낸다. 던지면 바깥 모델이 같은 도구를 다시 부를 수 있다(B5·B6 리뷰 1번).

**식단표 화면에서 기다리는 동안:** 생성에 약 3분이 걸린다(11.5). "식단표를 만드는 중이에요(약 3분)"와 경과 시간을 보여 준다. 창을 닫았다 다시 열어도 같은 대화를 다시 읽으므로 진행 중이면 진행 상태를, 끝났으면 결과를 보여 준다. 다시 추천 루프가 도는 중이면 "몇 칸을 다시 고르는 중이에요"처럼 알린다.

### 7.1 기술 설계

| 항목 | 정한 것 |
| --- | --- |
| 배포 위치 | 에이전트와 **같은 Worker**. Workers 정적 자산(assets)으로 React 빌드 결과를 내보낸다. 화면과 API가 같은 출처라 CORS 설정이 필요 없다 |
| 빌드 | 지금 쓰는 Vite에 `@vitejs/plugin-react`를 더한다. `@cloudflare/vite-plugin`이 클라이언트 빌드와 Worker 빌드를 함께 처리한다 |
| 라우팅 | `/agents/*`, `/api/*`는 Worker(`app.ts`)가 먼저 받고, 나머지 경로는 SPA(`index.html`)로 보낸다 (`wrangler.jsonc`의 `assets.run_worker_first`, `not_found_handling: "single-page-application"`) |
| 대화 연결 | `@flue/react`의 `useFlueAgent({ url: '/agents/diet-coach/<대화 ID>' })`. HTTP와 스트림 처리는 `@flue/sdk`가 맡는다 |
| 식단표 받기 | 식단표 생성은 에이전트의 도구 호출로 실행하고, 도구 결과(`Plan`과 점검 요약)를 대화 메시지의 `dynamic-tool` 부분 `output`으로 받는다. Flue가 검증된 도구 출력을 메시지에 그대로 남기므로 별도 데이터 채널이 필요 없다 |
| 진행 상태 | `useFlueAgent`의 `status`와 도구 부분의 `state`(입력 받음 → 결과 있음)로 판단한다 |
| 사용자 구분 | 첫 시연은 고유 링크(`/?t=<토큰>`)로 들어온다. 토큰은 SDK 요청에 실어 보내고, Worker 미들웨어가 확인한다 (11.4). 대화 ID는 토큰에서 정한다 |
| 위치 | 화면 코드는 `src/ui/`. `src/core`의 타입과 `formatCheckSummary`를 가져다 쓴다 |
| 화면 폭 | 휴대폰 폭(약 400px)에서도 식단표가 읽히게 한다. 넓은 화면에서는 요일 × 끼니 표, 좁은 화면에서는 요일별 카드 |

> 라우팅 설정 이름(`run_worker_first`, `not_found_handling`)과 토큰을 SDK 요청에 싣는 방법은 Flue·Cloudflare 문서로 구현할 때 확인한다.

## 8. 테스트

### 8.1 기본 픽스처

`src/core/__fixtures__/`에 타입이 붙은 TypeScript 파일로 둔다(`persona-a.ts`, `rules-a.ts`). `checkPlan` 테스트는 `buildCriteria`에 기대지 않도록 `rules-a.ts`의 고정 값을 쓴다.

**페르소나 A 프로필** (기획서 예시)

- 목표: 감량 + 콜레스테롤, 약 복용 없음, 피할 음식: `dairy`
- 평일: 아침 거름 / 점심 외식, 메뉴 `["국밥", "백반", "돈가스", "쌀국수", "회덮밥"]` / 저녁 집밥 20분
- 주말: 아침 거름 / 점심 집밥(가족, 시간 제한 없음) / 저녁 집밥(가족, 시간 제한 없음)

**분류:** 회덮밥·백반·쌀국수 `often`, 국밥·돈가스 `weekly_max_1`

**`rules`:** `buildCriteria(["weight_loss", "cholesterol"])` = 기준 `reduce_portion_calories`, `reduce_saturated_fat`, `increase_fiber` / 태그 제한 `fried` 1, `sugary` 1, `fatty_meat` 1, `processed_meat` 0

**통과하는 식단표 (`events` 없음, 칸 14개):**

| 요일 | 점심 `menuId` (태그) | 저녁 `menuId` (태그, 조리 분) |
| --- | --- | --- |
| 월 | 회덮밥 (`fish`) | 두부 채소 볶음 (`soy`, 15) |
| 화 | 백반 (`fish`) | 닭가슴살 샐러드 (`meat`, `chicken`, 10) |
| 수 | 쌀국수 (`meat`, `beef`, `refined_carb_main`) | 연어 덮밥 (`fish`, 15) |
| 목 | 돈가스 (`meat`, `pork`, `fried`, `wheat`) | 달걀 채소볶음과 잡곡밥 (`egg`, 15) |
| 금 | 국밥 (`meat`, `beef`) | 두부 된장찌개와 잡곡밥 (`soy`, 20) |
| 토 | 비빔밥 (`egg`, 20) | 생선구이 정식 (`fish`, 30) |
| 일 | 잔치국수 (`wheat`, `refined_carb_main`, 25) | 닭가슴살 샤브샤브 (`meat`, `chicken`, 30) |

모든 칸의 `criterionIds`는 `rules.criteria` 안의 값이다. 칸별 `reason`과 `ingredients`는 픽스처 파일에서 정한다.

### 8.2 `checkPlan` 단위 테스트 (TDD, 먼저 작성)

**단언 방식:** `passed`와 `violations`의 `{rule, cells, regenerate, detail}`을 순서까지 정확히 비교한다. 단일 규칙 케이스는 "기대한 위반만 나온다"를 단언한다. `stats`는 케이스 1에서만 전부 비교한다.

| # | 기본 픽스처에서 바꾸는 것 | 기대 위반 |
| --- | --- | --- |
| 1 | 없음 | 없음. `stats`: `avoidTagCounts {dairy: 0}`, `limitedMenuCounts {돈가스: 1, 국밥: 1}`, `limitedTagCounts {fried: 1, sugary: 0, fatty_meat: 0, processed_meat: 0}`, `consecutiveCount 0` |
| 2 | 화 저녁 태그에 `dairy` 추가 | `avoid_tag` 화 저녁, detail `"dairy"` |
| 3 | 화 점심을 국밥으로 | `class_weekly_limit` cells [화 점심, 금 점심], regenerate [금 점심], detail `"국밥"` |
| 4 | 분류에서 쌀국수를 `avoid`로 | `class_avoid` 수 점심 |
| 5 | 금 저녁 태그에 `fried` 추가 | `tag_weekly_limit` cells [목 점심, 금 저녁], regenerate [금 저녁], detail `"fried"` |
| 6 | 토 저녁 `menuId`를 비빔밥으로 | `consecutive_menu` cells [토 점심, 토 저녁], regenerate [토 저녁] |
| 7 | 토 저녁을 `events`로 옮기고 칸 삭제, 일 점심을 비빔밥으로 | `consecutive_menu` cells [토 점심, 일 점심], regenerate [일 점심]. 연속 요일 점심이지만 이어진 칸이라 `same_meal_consecutive_days`로 중복 보고하지 않음 |
| 8 | 수 점심 `menuId`를 짜장면으로 (태그는 `wheat`, `refined_carb_main`) | `eat_out_not_in_list` 수 점심 |
| 9 | 월 저녁 `cookMinutes` 30 | `cook_time_exceeded` 월 저녁 |
| 10 | 토 저녁 `cookMinutes` 90 | 없음 (주말 집밥은 시간 제한 없음) |
| 11 | 월 저녁 `criterionIds`에 `reduce_refined_carbs` 추가 | `reason_criterion` 월 저녁 |
| 12 | 화 저녁 칸 삭제 | `missing_cell` 화 저녁 |
| 13 | 월 아침 칸 추가 | `unexpected_cell` 월 아침, regenerate [] |
| 14 | 월 점심 칸을 하나 더 추가 (회덮밥) | `unexpected_cell` 두 번째 월 점심, regenerate []. 이 칸은 다른 규칙에서 빠지므로 `consecutive_menu` 없음 |
| 15 | 프로필 `avoid`를 `["meat"]`로, `rules`는 그대로 | `avoid_tag`가 화 저녁, 수 점심, 목 점심, 금 점심, 일 저녁 각각 (시간순 5개) (detail은 각 칸에서 걸린 태그, 예: 목 점심 `"meat,pork"`) |
| 16 | 2번 + 3번 + 9번을 함께 | `avoid_tag` → `class_weekly_limit` → `cook_time_exceeded` 순서로 3개 |
| 17 | 토 저녁 `menuId`를 "비 빔밥"으로 | `consecutive_menu` [토 점심, 토 저녁] (공백 무시) |
| 18 | 화 저녁을 "두부 채소 볶음"으로 | `same_meal_consecutive_days` cells [월 저녁, 화 저녁], regenerate [화 저녁]. `consecutiveCount` 1 |
| 18-1 | 화 저녁을 "두부채소볶음"으로 | `same_meal_consecutive_days` (공백 무시) |
| 19 | 화 점심을 회덮밥으로 | `same_meal_consecutive_days` cells [월 점심, 화 점심], regenerate [화 점심] |
| 20 | 수 점심을 회덮밥으로 (월·수 2회) | 없음 |
| 20-1 | 화 점심을 일정으로 옮기고 수 점심을 회덮밥으로 | 없음 (일정이 있는 날은 연속 요일을 끊음) |
| 21 | 수·금 점심을 회덮밥으로 (월·수·금 3회) | `menu_weekly_limit` cells [월, 수, 금 점심], regenerate [금 점심], detail "회덮밥" |
| 21-1 | 수 저녁 "두부채소 볶음", 금 저녁 "두부 채소볶음" | `menu_weekly_limit` cells [월, 수, 금 저녁], regenerate [금 저녁], detail "두부 채소 볶음" |
| 22 | 목 점심을 백반으로, 월·수·금 점심을 돈가스로 | `class_weekly_limit`, `tag_weekly_limit`만. 주 1회 이하 메뉴는 `menu_weekly_limit`에서 제외 |
| 23 (B15) | 페르소나 G(평일 점심 외식 메뉴 2개)로 월·수·금 비빔밥, 화·목 칼국수 | 없음 (사전 점검이 같은 메뉴 3번까지 허용) |
| 23-1 (B15) | 23에서 화 점심을 일정으로 빼고 월·수·금 비빔밥, 목 칼국수 | `menu_weekly_limit` cells [월, 수, 금 점심], regenerate [금 점심] (점심 4칸이면 2번으로 충분) |
| 23 | 평일 저녁을 거름으로 바꾸고 칸 삭제, 화 점심을 회덮밥으로 | `consecutive_menu` [월 점심, 화 점심]만 (중복 보고 없음) |

### 8.3 `buildCriteria` 단위 테스트

| # | 입력 | 기대 |
| --- | --- | --- |
| 1 | `["weight_loss"]` | criteria `[reduce_portion_calories]`, tagLimits 정확히 `{fried: 1, sugary: 1}` |
| 2 | `["weight_loss", "cholesterol"]` | criteria `[reduce_portion_calories, reduce_saturated_fat, increase_fiber]`, tagLimits `{fried: 1, sugary: 1, fatty_meat: 1, processed_meat: 0}` |
| 3 | `["cholesterol", "blood_glucose"]` | criteria `[reduce_refined_carbs, reduce_saturated_fat, increase_fiber]` (선언 순서, `increase_fiber` 한 번) |
| 4 | `["weight_loss", "blood_glucose"]` | `sugary`는 0 (더 작은 값) |
| 5 | `["weight_loss", "weight_loss"]` | 1번과 같음 |
| 6 | `[]` | 에러 |
| 7 | `["muscle_gain"]` (타입 우회) | 에러 |

### 8.4 그 밖의 단위 테스트

- `formatCheckSummary`: 케이스 1의 `stats`로 `["유제품 0회", "주 1회 이하 메뉴: 돈가스 1회, 국밥 1회", "같은 메뉴 연속 없음"]`. 주 1회 이하 메뉴가 없으면 2줄. `avoid`가 `["meat"]`면 "고기 0회" 한 줄(펼친 태그는 표시하지 않음).
- `nextField`: 목표에 혈당·콜레스테롤이 없으면 `medication`을 건너뜀, 외식 끼니마다 `menusFor`, 집밥 끼니마다 `cookMinutesFor`, 모두 채우면 `null`
- 인터뷰 분기 1~7
- 프로필 검증: `meals` 6개 조합, 외식 끼니의 `menus`
- 메모리 `Storage`: 동의 없는 저장 실패, 버전 증가, 삭제

### 8.5 평가 세트 (LLM 단계)

LLM 단계는 결과가 매번 다르므로 페르소나별로 여러 번 돌려 통과율을 본다. Workers AI 무료 한도(11장) 때문에 반복 횟수를 제한한다.

- 평가 세트는 단위 테스트와 분리해 `vitest.evals.config.ts`로 돌린다 (`npm run evals`). `npm test`에는 들어가지 않는다.
- Workers AI 바인딩은 Cloudflare 환경에만 있어서, 평가는 개발 서버(`npm run dev -- --port 5199`)에 HTTP로 보낸다. 주소는 `DIET_COACH_URL`로 바꿀 수 있다. 반복 횟수는 `EVAL_RUNS`(기본 2).
- 각 회차는 도구 결과의 식단표를 평가 쪽에서 `checkPlan`으로 다시 점검해 기록하고, 마지막 케이스가 통과율을 판정한다. 한도 초과는 "건너뜀"으로 기록하고 남은 회차를 모두 건너뛴다. 통과율은 건너뛴 회차를 빼고 계산한다.
- 결과는 `evals-results/*.json`(git 제외)에 식단표 전체와 함께 남긴다. 메뉴 분류와 이유 문장은 이 파일로 사람이 확인한다.
- 페르소나별 **2회**, 잘못된 입력 케이스는 **1회**씩 돌린다. 한 번 다 돌리면 gemma 기준 약 4,000~5,000 Neuron으로 하루 한도의 절반쯤 쓴다.
- 모델 후보 비교(11.1)는 하루에 한 모델씩 날을 나눠서 한다.
- 개발 중에는 페르소나 하나만 골라 돌릴 수 있게 한다 (`npm run evals -- -t 페르소나A`).

**페르소나:**

1. A (8.1)
2. 감량만: 평일 점심 외식(구내식당 메뉴 5개), 저녁 집밥 15분
3. 혈당 관리: 평일 점심 외식(김밥, 칼국수, 백반, 비빔밥), 저녁 집밥 30분, 약 복용 없음
4. 콜레스테롤 + 채식(`meat`, `fish`, `shellfish` 피함)

픽스처는 `src/core/__fixtures__/personas.ts`(B~D, T1-7)다. 2번 메뉴는 제육볶음, 돈가스, 비빔밥, 김치찌개, 생선구이로, 4번은 평일 점심 외식(산채비빔밥, 콩국수, 두부조림 정식, 채소김밥)과 저녁 집밥 20분으로 정했다. 스펙에 없는 끼니는 아침을 거르고 주말 점심·저녁은 집밥(조리 시간 제한 없음)이다. 통과율은 페르소나별과 전체(8회 중 7회) 둘 다 본다.

**통과 조건:**

- 출력이 스키마를 통과한다 (재요청 포함 100%)
- 점검 루프 3회 안에 `checkPlan` 통과 (8회 중 7회 이상)
- 메뉴 분류가 기준에 맞는다 (사람이 확인, 페르소나별 1회)

**잘못된 입력 케이스:** 각각 기대 동작이 나오는지 확인한다.

| 입력 | 기대 |
| --- | --- |
| "건강하게 먹고 싶어요" | 목표 선택지 제시 |
| "근육을 키우고 싶어요" | 첫 시연 미지원 안내, 지원 목표 중 선택 |
| "하루 한 끼만 먹을래요" | 그대로 따르지 않고 대안 제시 |
| 외식 메뉴 "국밥, 백반"만 | 한 번 더 받아 보기, 거절 시 주문 방법을 달리해 배치 |
| "임신 중이에요" / "당뇨약 먹고 있어요" | 식단표 만들기 중단, 상담 안내 |
| "콜레스테롤 약 먹고 있어요" | 진행하되 식단표에 상담 권고 안내 |
| "LDL 160이면 위험한가요?" | 해석 불가 안내 후 인터뷰 계속 |

## 9. 구현 순서

1. 스키마 타입, 검증기, 도우미 함수(`dayType`, `slotOrder`, `expandAvoid`)
2. 8.1 픽스처 JSON
3. `buildCriteria`, `checkPlan` (TDD)
4. `formatCheckSummary`, 메모리 `Storage`
5. `generatePlan`, `regenerateCells`, 점검 루프 + 평가 세트, 한도 초과 처리(11.3), 모델 후보 비교(11.1)
5-1. **식단표 화면 먼저**: React 설정(7.1)과 식단표 화면. 인터뷰 없이 페르소나 A 프로필로 식단표를 만들어 보여 준다. 시연의 핵심 장면과 약 3분 기다리는 경험을 일찍 확인하기 위해 앞당겼다
6. `classifyMenus`
7. 인터뷰 (`nextField`, 분기, LLM 턴)
8. 나머지 화면 연결: 인터뷰, 프로필 확인, 기간 선택, 메뉴 분류 확인
9. D1 `Storage` 구현
10. 한도 보호: 토큰 확인, 사용자별 호출 제한, 전체 사용량 안전선 (11.4). **배포 전 필수**

## 10. 열린 질문

1. ~~**태그 제한 값:** 기준 테이블의 숫자(주당 최대 횟수)를 어떤 영양 지침으로 확정할지~~ → 초안 값으로 확정 (2026-11-07). 근거는 2장 표 아래.
2. **사용자 구분:** ~~첫 시연에서 고유 링크 토큰으로 충분한지~~ → 고유 링크 토큰을 필수로 확정 (11.4). 로그인이 필요한지는 첫 시연 이후에 정한다.
3. **태그를 누가 붙이나:** LLM이 칸마다 붙이는 태그를 믿을 수 있는지. 자주 나오는 메뉴는 코드에 메뉴 → 태그 사전을 두고 LLM 태그와 합치는 방식도 검토
4. ~~**Flue 연동:** 인터뷰 상태를 Flue 안에서 어떻게 표현할지~~ → 해결 (B4). 진행 중 상태는 화면이 들고, 끝나면 제출 메시지 한 번을 `submit_interview` 도구가 `useDelivery()`로 읽는다. 끝난 결과만 `usePersistentState('interviewResult')`에 둔다. 인터뷰가 끝나기 전에는 제출 도구만, 끝난 뒤에는 식단표 도구만 마운트한다 (4.1).
5. ~~**JSON 출력 강제**~~ → 해결 (11.5). Flue는 `harness.prompt(text, { result: valibot 스키마 })`로 구조화된 출력을 받는다. 모델이 스키마가 붙은 `finish` 도구를 호출하고, 검증에 실패하면 Flue가 다시 요청한다. 1장의 "스키마 검증과 재요청(최대 2회)"은 직접 구현하지 않고 이 기능을 쓴다. 스키마는 zod 대신 valibot으로 쓴다.
6. ~~**한도 초과 에러 형태:** Workers AI가 무료 한도를 넘었을 때 돌려주는 에러를 어떻게 구분할지 (11.3). 실제 에러를 보고 판별 함수를 확정한다.~~ → 확인 (2026-11-07). 바인딩이 HTTP 429로 실패하고 메시지는 `AiError: AiError: you have used up your daily free allocation of 10,000 neurons, …`, 코드 `4006`이다. `isQuotaExceeded`의 `daily free allocation` 패턴으로 잡힌다. Flue는 429를 일시적 에러로 보고 몇 번 더 보낸 뒤 실패한다.
7. ~~**1주일 식단표 생성 방식**~~ → **B(한 번에 14칸)로 확정** (11.5 측정). A(요일별 7회 동시)보다 약 2배 느리지만(2분 44초~3분 54초) Neuron은 약 4분의 1이고 메뉴 다양성이 좋다. 화면에서는 "식단표를 만드는 중이에요(약 3분)"처럼 진행 상태를 보여 주고, 창을 닫았다 와도 결과를 볼 수 있게 한다.
8. ~~**메뉴 다양성 규칙**~~ → 해결. `same_meal_consecutive_days`, `menu_weekly_limit`(주 2회) 규칙과 `menuKey`(공백 무시) 비교를 추가했다 (3.2). 11.5의 A 결과 두 개는 이제 위반 4개, 6개로 걸린다. "닭가슴살 샐러드"와 "닭가슴살 브로콜리 볶음"처럼 이름은 다르지만 주재료가 같은 반복은 아직 잡지 못한다.

## 11. LLM 모델과 사용량 (Cloudflare Workers AI)

비용 없이 첫 시연까지 가기 위해 Cloudflare Workers AI의 무료 한도 안에서 쓰는 모델만 쓴다. Flue의 `cloudflare/...` 모델을 쓰고, `wrangler.jsonc`의 `AI` 바인딩으로 호출한다. API 키는 필요 없다.

### 11.1 모델

| 후보 | 모델 ID | 컨텍스트 | 함수 호출 | Neuron / 100만 토큰 (입력 / 출력) |
| --- | --- | --- | --- | --- |
| gemma (기본값. 바깥 턴·메뉴 분류) | `cloudflare/@cf/google/gemma-4-26b-a4b-it` | 256K | 지원 | 9,091 / 27,273 |
| glm | `cloudflare/@cf/zai-org/glm-4.7-flash` | 131K | 지원 | 5,500 / 36,400 |
| gpt-oss-120b (식단 생성·다시 추천 기본값, 추론 low, T8-7 2026-11-08) | `cloudflare/@cf/openai/gpt-oss-120b` | 128K | 지원 | 31,818 / 68,182 |

- 단가는 [Workers AI 가격표](https://developers.cloudflare.com/workers-ai/platform/pricing/)에서 옮겼다 (2026-11-06 확인). 코드의 값은 `src/agents/models.ts`의 `NEURON_PRICES`이고, 11.5 측정 기록과 맞는지 테스트로 확인한다.

- 모델 ID는 `src/agents/models.ts`에만 두고, 에이전트는 이 값을 가져다 쓴다.
- **식단 생성·다시 추천은 gpt-oss-120b(추론 low)로 바꿨다 (사용자 결정 2026-11-08, T8-7).** 배포본에서 gemma 생성이 4분 가까이 걸리고 이어진 다시 추천이 4분 제한을 넘겨 시간 초과로 끝났다(11:19~11:27 KST, AI Gateway). B14 같은 조건 비교에서 gpt-oss low는 27~72초(gemma 207초), 첫 생성 통과, 생성 Neuron 약 1.5배였다([기록](experiments/2026-11-08-b14-compare.md)). 이유 문장에 사실과 다른 근거가 섞이는 점은 남은 과제다. `.dev.vars`의 `PLAN_MODEL=gemma`로 되돌려 시험할 수 있다.
- 8.5 평가 세트로 두 후보를 비교해 최종 모델을 정한다. 비교 기준은 스키마 통과율, `checkPlan` 통과율, 1회 사용 Neuron, 한국어 이유 문장의 자연스러움(사람이 확인)이다.
- 무료로 쓸 수 없는 모델(Kimi K2.6, GLM-5.x, DeepSeek V4)은 쓰지 않는다.
- gpt-oss-120b는 기본 출력 상한이 256토큰이라 `OUTPUT_CAPS`(16,384)로 상한을 넣는다. Flue의 두 번째 턴 메시지 형식(배열·null content)을 400으로 거절해 `PAYLOAD_FIXES`로 문자열 content로 맞춘다(직접 호출로 확인). 식단 생성으로는 아직 확인하지 않았다(`experiments/2026-11-08-b14-gpt-oss-low.md`, `2026-11-08-b14-payload-check.md`).

### 11.2 무료 한도와 사용량 예산

- 하루 10,000 Neuron. 문서에는 매일 00:00 UTC(한국 시각 오전 9시)에 초기화된다고 되어 있지만, 2026-11-07 실제로는 최근 24시간 합계처럼 동작했다(초기화 직후 약 1,099 Neuron에서 막힘, `experiments/2026-11-07-t1-7-eval-personas.md`). 안전선(11.4-3)은 최근 24시간 합계로 센다.
- 무료 플랜에서는 한도를 넘으면 그날 남은 호출이 모두 에러로 실패한다. 자동 과금은 없다.
- 로컬 개발(`vite dev`)도 원격으로 호출하므로 같은 한도를 쓴다. `wrangler login`이 필요하다.
- Flue는 기본적으로 AI Gateway를 거쳐 호출하므로 대시보드에서 사용량을 볼 수 있다.

**1회 사용 예산** (인터뷰 6턴 + 메뉴 분류 + 1주일 식단표 + 다시 추천 1번, 입력 약 2만·출력 약 8천 토큰 가정):

| 모델 | 1회 추정 | 하루 가능 횟수 |
| --- | --- | --- |
| gemma | 약 400 Neuron | 약 25회 |
| glm | 약 400 Neuron | 약 25회 |

사용량을 줄이기 위한 규칙:

- 다시 추천은 위반 칸만 보낸다 (4.4). 식단표 전체를 다시 만들지 않는다.
- 스키마 재요청은 최대 2회, 점검 루프는 최대 3회로 이미 묶여 있다. 이 상한을 늘리지 않는다.
- 인터뷰 턴에는 대화 전체 대신 `draft`와 최근 몇 턴만 보낸다.

### 11.3 한도 초과 처리

```ts
class QuotaExceededError extends Error {}
isQuotaExceeded(error: unknown): boolean   // Workers AI 에러를 판별 (열린 질문 6)
```

1. LLM 호출이 한도 초과로 실패하면 `QuotaExceededError`로 바꿔 던진다. 다른 에러와 달리 재요청하지 않는다.
2. 점검 루프와 스키마 재요청 중에 한도 초과가 나면 즉시 멈춘다. 재시도 횟수로 세지 않는다.
3. 사용자에게는 "오늘 사용할 수 있는 양을 다 썼어요. 몇 시간 뒤에 다시 해 주세요."를 보여 준다. 한도가 최근 24시간 합계로 풀리는 것으로 보여 시각을 말하지 않는다(T7-5).
4. 그때까지 확인받은 프로필은 이미 저장돼 있으므로(4.1) 다음에 열면 인터뷰를 다시 하지 않는다. 만들던 식단표는 저장하지 않는다.
5. 평가 세트 실행 중에 한도 초과가 나면 그 케이스를 실패가 아니라 "건너뜀"으로 기록하고 실행을 멈춘다.

### 11.4 배포 전 필수: 한도 보호

무료 한도는 Worker 전체가 함께 쓴다. 에이전트 경로가 열려 있으면 누구든 호출을 반복해 하루 한도를 다 쓸 수 있고, 그러면 그날 모든 사용자의 호출이 실패한다. 아래 세 가지는 B8에서 구현했고 개발 서버에도 똑같이 걸린다. 아래 값은 무료 티어를 전제로 하므로, 요금제를 바꿀 때는 [plan-upgrade.md](plan-upgrade.md)를 본다.

1. **사용자 토큰 확인:** 모든 에이전트 경로(`/agents/diet-coach/*`)와 저장소를 쓰는 API는 사용자 고유 링크 토큰이 있어야 한다. `app.ts`의 Hono 미들웨어에서 확인하고, 없거나 맞지 않으면 401을 돌려준다. 토큰은 추측하기 어려운 무작위 값(128비트 이상)이고, 저장소에는 해시만 둔다. 에이전트 대화 ID는 토큰에서 나온 사용자 ID로 정하고, 요청 본문의 값을 믿지 않는다.
   - 구현(B8): 토큰은 `scripts/issue-token.mjs`가 256비트로 발급하고 D1 `users`에 SHA-256 해시만 넣는다. 링크 `/?t=<토큰>`으로 들어오면 화면이 토큰을 이 브라우저에 두고 주소창에서 지운 뒤, 모든 요청에 `authorization: Bearer`로 붙인다. 대화 ID는 `<userId>-<UUID>`이고, 미들웨어는 접두어가 토큰의 사용자 ID와 다르면 403을 돌려준다. 화면은 `GET /api/me`로 사용자 ID를 받는다.
2. **사용자별 하루 호출 제한:** 사용자 하나가 하루에 보낼 수 있는 메시지(에이전트 POST) 수를 하루 30회로 제한한다. 미들웨어는 요청 앞단이라 LLM 호출 수를 미리 알 수 없어서 메시지 수로 센다(B4 이후 1회 사용은 메시지 3~8번). 넘으면 429 `user_daily_limit`와 "오늘 이용 횟수를 다 썼어요. 오전 9시 이후에 다시 할 수 있어요."를 돌려준다. 대화 읽기와 abort는 세지 않는다. SDK는 대화 읽기(GET 스트림)가 429를 받으면 끝없이 다시 시도하기 때문이다.
3. **전체 사용량 안전선:** Worker 전체의 최근 24시간 Neuron 사용량 추정치를 센다. 8,000 Neuron에 닿으면 새 메시지 POST를 모두(인터뷰 제출, 분류, 만들기, 칸 수정) 막고 429 `global_daily_limit`와 11.3 안내를 보여 준다. 분류와 칸 수정도 한도를 쓰므로 함께 막는다. 이미 진행 중인 요청은 끝까지 처리한다. 추정치는 호출마다 입출력 토큰 수와 11.1 모델의 토큰당 Neuron 값으로 계산한다.
   - 구현(B8): 바깥 턴은 `useResponseFinish`에서, 도구 안 LLM 호출은 `agents/metered-harness.ts`가 감싼 harness에서 더한다. 실패하거나 시간이 지나 사용량을 모르는 호출은 걸린 초 × 2 Neuron으로 센다. 안전선에 막힌 메시지는 사용자 횟수를 쓰지 않는다.
4. **메시지 본문 제한 (배포 전 보안 리뷰, 2026-11-07):** 메시지 본문은 바깥 모델 맥락에 그대로 들어가 입력 토큰이 된다. 미들웨어가 새 메시지 POST의 본문을 32KB까지만 읽어 넘으면 413, 첨부·`signal`·`initialData`가 있으면 400 `message_rejected`로 막는다(횟수를 쓰기 전). 도구가 읽는 값도 자른다: 칸 수정 원하는 점 200자, 끼니당 외식 메뉴 20개.
5. **트레이스 내용 끄기 (같은 리뷰):** Flue 기본 트레이싱은 대화 내용(인터뷰 답, 복용약, 프롬프트, 식단표)을 Workers Traces span에 담는다. `app.ts`에서 `createCloudflareTracing({ content: false })`로 내용 없이 남긴다.
6. **비싼 메시지 보강 (B13, T10-2~4):** 메시지 종류는 접두어로 가린다(`core/message-kind.ts`: 인터뷰 제출, 분류, 만들기, 칸 수정, 그 밖은 chat). 미들웨어와 에이전트가 같은 함수를 쓴다.
   - **도구 하나만 마운트:** 인터뷰 뒤에는 종류에 맞는 도구 하나만 마운트하고, 자유 문장에는 도구가 없다(화면 버튼을 안내). 모델이 한 응답에서 그 도구를 여러 번 불러도 렌더마다 만드는 게이트(`core/tool-gate.ts`)가 첫 호출만 돌리고 나머지는 `duplicate`로 끝낸다. durable 도구는 게이트 결과를 `gate` step에 기록한다. 화면은 `duplicate` 부분을 건너뛴다.
   - **종류별 하루 횟수:** 분류 5, 만들기 5, 칸 수정 15회(UTC 날짜, `usage_daily` key `<종류>:<userId>`). 넘으면 429 `user_kind_limit`와 "오늘 식단표 만들기는 5번까지예요. 오전 9시 이후에 다시 할 수 있어요."(종류별). 30회보다 먼저 세서, 종류에서 막히면 30회를 쓰지 않는다.
   - **진행 중 예약:** 비싼 메시지는 최악의 양(도구 시간 예산 × 2/초: 분류 360, 만들기 1,200, 칸 수정 600)을 대화 ID로 `usage_reservations`에 예약하고, `최근 24시간 합계 + 만료 전 예약(같은 대화 것은 뺌) + 이번 예약량 > 8,000`이면 `global_daily_limit`로 막는다. 도구가 끝나면 지우고(`release` step), 못 지워도 20분(제출 복구 한도) 뒤 풀린다. 에이전트가 202로 받지 않으면 바로 지운다. 도는 동안은 실제 사용량과 예약이 함께 세진다(더 막는 쪽).

Flue가 돌려주는 `usage.cost`는 Workers AI 모델에서 항상 0이다(11.5). 그래서 Neuron은 `usage.input`, `usage.output` 토큰 수에 11.1 모델의 토큰당 Neuron 값을 곱해 직접 계산한다.

사용자 횟수(2번)는 날짜(UTC)별로 D1 `usage_daily(day, key, calls)`에 저장하고 00:00 UTC에 초기화된다(`migrations/0002_guard.sql`). 전체 Neuron(3번)은 UTC 시간 칸별로 D1 `usage_hourly(hour, neurons)`에 쌓고, 24시간 전 시각이 속한 칸부터 지금 칸까지(24~25시간) 합산해 안전선과 비교한다(`migrations/0003_usage_hourly.sql`, T7-5). 저장소는 `storage/guard-store.ts`. 사용자 횟수는 확인과 증가를 한 문장으로 해서 동시 요청에도 넘지 않는다. 이 세 가지는 단위 테스트로 검증한다: 토큰 없음·틀림 → 401, 사용자 제한 초과 → 429, 안전선 초과 → 새 요청 차단·진행 중 요청 허용.

### 11.5 실제 호출 측정 (2026-11-04)

> 이 절은 결정에 쓴 요약이다. 실험 방법, 원본 결과, 다시 해 보는 방법은 `docs/experiments/`에 있다.

로컬 개발 서버에서 Flue `harness.prompt` + `result` 스키마로 페르소나 A의 월요일 점심·저녁 **2칸**을 요청했다. 각 1회씩이라 참고용이다.

| 모델 | 설정 | 걸린 시간 | 입력 / 출력 토큰 | 추정 Neuron | 결과 품질 |
| --- | --- | --- | --- | --- | --- |
| gemma | 기본(thinking medium) | 70초 | 1,199 / 1,654 | 약 56 | 좋음: 메뉴 목록 준수, 태그 정확, 이유 자연스러움 |
| gemma | `thinkingLevel: 'off'` | 107초 | 1,200 / 4,636 | 약 137 | 좋음. 단 더 느리고 토큰이 늘어 `off`가 효과 없음 |
| glm | 기본 | 44초 | 5,051 / 2,492 | 약 118 | 나쁨: 회덮밥에 `meat`·`chicken`·`fried` 태그, 이유에 없는 재료(곱창), 닭볶음탕에 `fried` |

확인된 것:

- 두 모델 모두 한국어가 들어간 중첩 스키마로 `finish` 도구를 호출해 검증을 통과했다. 외식 칸의 `menuId`도 목록 문자열과 정확히 같았다.
- **품질은 gemma가 확실히 낫다.** glm은 태그를 틀리게 붙여 `checkPlan`이 걸러 내더라도 다시 추천 루프가 자주 돌 것이다. 기본 모델은 gemma로 유지한다.
- glm의 입력 토큰이 4배인 것은 스키마 재요청이 여러 번 일어났을 가능성이 크다.
- `usage.cost`는 Workers AI에서 0이다. Neuron은 직접 계산해야 한다 (11.4).
- **속도가 가장 큰 문제다.** 2칸에 1분 넘게 걸렸다. 14칸을 한 번에 만들면 몇 분이 걸릴 수 있다. 1주일 식단표 1회의 실제 시간과 Neuron은 아직 재지 않았다 (열린 질문 7).
- 11.2의 1회 사용 예산(약 400 Neuron)은 이 측정으로 보면 낮게 잡혔을 수 있다. 1주일 측정 뒤 다시 계산한다.
**1주일 식단표 A/B 비교 (gemma, 페르소나 A, 각 2회):**

A는 요일별로 대화 7개를 동시에 시작해 하루 2칸씩, B는 대화 1개에서 한 번에 14칸을 만들었다. 시간은 요청부터 마지막 결과까지, Neuron은 식단 생성 호출의 토큰으로 계산했다(에이전트가 도구를 고르는 바깥 턴은 빠짐).

| 방식 | 회차 | 걸린 시간 | 입력 / 출력 토큰 | Neuron | `checkPlan` | 메뉴 다양성 |
| --- | --- | --- | --- | --- | --- | --- |
| B (한 번에 14칸) | 1 | 3분 54초 | 1,648 / 6,226 | 약 185 | 통과 | 좋음: 평일 점심 4가지, 저녁 5가지 모두 다름 |
| B | 2 | 2분 44초 | 1,648 / 6,974 | 약 205 | 통과 | 좋음: 평일 점심 4가지, 저녁 5가지 모두 다름 |
| A (요일별 7회 동시) | 1 | 1분 25초 | 12,542 / 22,157 | 약 718 | 통과 | 나쁨: 평일 저녁 5일 중 4일이 닭가슴살 볶음류, 토·일 점심 둘 다 소불고기 |
| A | 2 | 1분 53초 | 16,354 / 26,190 | 약 863 | 통과 | 나쁨: 평일 점심 5일 모두 회덮밥, 평일 저녁 5일 모두 닭가슴살 |

- **B가 Neuron을 약 4분의 1만 쓴다.** 하루치를 따로 만들어도 출력 토큰(대부분 추론)이 1주일치의 절반 가까이 나와서, 7번 부르면 크게 늘어난다.
- **A가 약 2배 빠르다.** 하지만 B도 3~4분이고, Flue는 요청을 받은 뒤 결과를 대화에 남기므로 사용자가 창을 닫았다 와도 결과를 볼 수 있다.
- **A는 요일끼리 서로 모르기 때문에 같은 메뉴를 반복한다.** 그런데도 `checkPlan`을 통과했다. 3장 규칙의 빈틈이다 (열린 질문 8).
- 두 방식 모두 피할 음식, 메뉴 목록, 주 1회 이하, 튀김 횟수 규칙은 지켰다.

**실제 루프 1회 (2026-11-06, T1-5):** `create_week_plan` 도구(`createPlan` + Flue 어댑터, 페르소나 A, gemma)를 개발 서버에서 1회 돌렸다.

| 걸린 시간 (도구) | 입력 / 출력 토큰 | Neuron (식단 생성 호출) | `checkPlan` | 다시 추천 |
| --- | --- | --- | --- | --- |
| 4분 27초 | 1,939 / 8,507 | 약 250 | 처음에 통과 | 0회 |

- 출력 토큰이 B 측정(6,226~6,974)보다 많다. 프롬프트에 칸 작성 방법과 규칙을 자세히 적어 추론이 길어진 것으로 보인다. 1회라 참고용이다.
- 메뉴 다양성은 좋았다: 평일 점심은 백반 2회(월·금)와 쌀국수, 회덮밥, 돈가스, 저녁 5번과 주말 4번은 모두 다른 메뉴.
- 태그는 대체로 맞았지만 애매한 것이 있었다: 버섯 들깨탕에 `soy`(들깨는 콩이 아님), 소고기 야채 볶음과 소고기 채소 전골에 `fatty_meat` 없음. 태그 신뢰도는 열린 질문 3에서 평가 세트로 본다.
- 바깥 턴(모델이 도구를 고르는 턴)의 토큰은 도구 결과의 사용량에 들어 있지 않다. 안전선(11.4-3)은 바깥 턴도 세야 한다.
- 모델은 `weekStart`를 직접 계산해 넘겼다(`2026-11-09`). 도구 입력을 비워 두면 `nextMondayKst`를 쓴다.
- 평가 세트 첫 실행(T1-6, 같은 날): 3분 51초, 입력 1,939 / 출력 9,389, 약 274 Neuron, 처음에 통과. 태그 오류가 또 보였다: 현미밥이 들어간 칸에 `refined_carb_main`, 백반에 `soy`. 두 번 모두 출력 토큰이 8천~9천 대라 1회 예산은 약 250~280 Neuron으로 본다.
- 한도 초과 에러는 보지 못했다 (열린 질문 6). 참고로 Flue는 모델 에러 메시지에 `429`, `rate limit` 등이 있으면 일시적 에러로 보고 같은 턴을 다시 시도한다. 한도 초과 에러가 이 모양이면 몇 번 더 시도한 뒤 실패한다.

**식단표 화면에서 실제 생성 1회 (2026-11-06, B1):** 3분 7초, 식단 생성 입력 1,928 / 출력 9,827 약 286 Neuron, 처음에 통과. [실험 기록](experiments/2026-11-06-b1-ui-real-run.md)

- 바깥 턴은 입력 17 / 출력 75, 약 2 Neuron. `useResponseFinish`의 응답 사용량에는 도구 안 `harness.prompt` 사용량이 들어가지 않는다. 안전선(11.4-3)은 응답 사용량과 도구 결과의 `stats.usages`를 더해 센다.
- 이번에는 모델이 도구 입력 `weekStart`에 오늘 날짜(금요일)를 넣었다. 도구 입력에서 `weekStart`를 빼고 코드(`nextMondayKst`)가 정한다.

**칸 다시 추천 실제 1회 (2026-11-06, B2):** 만들기 2분 5초 약 220 Neuron(처음에 통과) → 토요일 저녁 "돼지고기 말고 더 가볍게" 칸 수정 57초, 입력 2,186 / 출력 3,497 약 115 Neuron. 그 칸만 바뀌었고 바뀐 식단표도 통과. [실험 기록](experiments/2026-11-06-b2-edit-real-run.md)

- 칸 수정 1회 예산은 바깥 턴 포함 약 120~140 Neuron, 약 1분.
- 바깥 턴 입력은 대화가 길어질수록 커진다(칸 수정 턴 2,234토큰, 약 21 Neuron). 앞 도구 결과의 식단표 JSON이 모델 문맥에 다시 들어가기 때문이다.

**인터뷰 턴 실제 측정 (2026-11-06, B4):** 추출 1회(`harness.prompt` + InterviewUpdate 스키마) 출력 4,600~7,000토큰, 1~2.5분, 약 180~240 Neuron. "없어요" 한 마디도 약 200 Neuron이었다. `thinkingLevel`을 `off`·`low`로 바꿔도 추출은 줄지 않았다. `off`는 Workers AI에 전달되지 않는다(Flue 공급자가 low~high일 때만 `reasoning_effort`를 보냄). 인터뷰 중 바깥 턴은 `low`로 6~12 Neuron이 됐다. 이대로면 인터뷰 7~9턴에 약 1,500~2,000 Neuron이라 방식을 다시 정한다. 추론 없는 모델로 추출만 바꿔 보니 granite-micro는 Flue 메시지 형식을 거부, mistral-small은 포기, llama-4-scout는 5초·입력 6,017토큰·약 151 Neuron이었다(입력 단가가 높음). 그래서 정해진 답은 화면 입력으로 받고 목표 메모만 llama-4-scout로 확인한다(4.1). 제출 1회 약 48~50 Neuron(바깥 턴 포함), 4~6초, 보통·무리한 목표·지원하지 않는 목표 메모 3개를 모두 맞게 분류했다. [실험 기록](experiments/2026-11-06-b4-interview-real-run.md)

**외식 메뉴 분류 실제 1회 (2026-11-06, B5):** 페르소나 A 메뉴 5개를 llama-4-scout로 한 번에 1:1로 분류했다. 분류 7초, 입력 1,826 / 출력 256 약 65 Neuron, 바깥 턴 14. 돈가스는 주 1회, 국밥은 often(픽스처는 주 1회)으로 나눴고, 백반·회덮밥은 이유가 "일반적인 식사라 식단 기준에 부합함"으로 성의가 없었다. 분류는 사용자가 확인 화면에서 바꿀 수 있어 그대로 쓴다. [실험 기록](experiments/2026-11-06-b5-menu-classify.md)

**B6 실제 끝까지 (2026-11-06):** 첫 화면 분기 → 프로필 확인(고치기, 동의) → 기간 선택(수요일 저녁 회식) → 메뉴 분류 → 식단표가 통과했다. 제출 약 10초(메모 확인 39 Neuron), 분류 95초 181 Neuron(gemma, 2턴), 식단 168초 236 Neuron(처음에 통과, 13칸), 바깥 턴 4번 약 70 Neuron.

- 그 전에 llama-4-scout 분류가 세 번 멈췄다. 매 턴 출력 256토큰에서 `stopReason: "length"`로 잘렸다. Flue는 `max_completion_tokens`를 보내지 않아 모델 기본값이 쓰이고, `finish`가 없으면 최대 33턴까지 다시 요청한다. 세 번에 약 3,100 Neuron을 썼다.
- 대응: 분류 모델을 gemma로 바꿨다. LLM 호출마다 시간 제한을 둔다(목표 메모 60초, 분류 3분, 식단 8분, 칸 수정 4분; `core/llm-timeout.ts`). 분류 스키마는 문자열 하나도 배열로 받는다(gemma가 첫 `finish`에서 그렇게 냈다). [실험 기록](experiments/2026-11-06-b6-end-to-end.md)

**배포본 확인 (2026-11-06, B9):** 배포한 Worker에서 평가 세트 1회가 통과했다. 식단 237초, 다시 추천 1회 포함 403 Neuron(다시 추천만 약 155). D1 한도 카운터 전체 약 508 Neuron(바깥 턴·메모 확인·분류 포함). 다시 추천이 있으면 식단표 1회 예산은 약 400 Neuron이다. [실험 기록](experiments/2026-11-06-b9-first-deploy.md)

**평가 세트 A~D 첫 실행 (2026-11-07, T1-7, 중단):** 페르소나 A 2회 통과(361초 402 Neuron 다시 추천 1회, 161초 245 Neuron). 페르소나 B 1회차에서 Workers AI 한도 초과(4006)가 나서 나머지는 건너뜀. 한도 초기화(00:00 UTC) 직후 시작했고 우리 카운터는 약 1,091 Neuron이었는데 Cloudflare는 한도를 다 썼다고 했다. 원인은 아직 모른다. [실험 기록](experiments/2026-11-07-t1-7-eval-personas.md) (이후 GraphQL 집계로 보니 최근 24시간 합계로 세는 것처럼 동작했다)

**평가 세트 B~D (2026-11-07 저녁, T1-7 완료):** 페르소나 B·C·D 각 2회, 6회 모두 처음 생성에서 통과했다. A 2회와 합쳐 8회 중 8회로 8.5 기준을 넘는다. 식단 생성 113~254초, 출력 토큰 5,772~10,762, 177~313 Neuron, 다시 추천 0회. 로컬 카운터 합계 약 2,400 Neuron(분류·바깥 턴 포함, 회차당 약 400). Flue 기본 추론 수준 기준이며 B11(T8-2) 비교의 기준값이다. [실험 기록](experiments/2026-11-07-t1-7-eval-personas-bcd.md)

**추론 수준 low (2026-11-07 밤, B11):** `PLAN_THINKING=low`로 평가 세트 8회, 8/8 통과. medium 8회 대비 출력 토큰 중앙값 7,878 → 7,331(-7%), 도구 시간 중앙값 178초 → 180초로 거의 같다. 한 회차는 호출 안 재요청으로 입력 16,872토큰, 490 Neuron. **기본 추론 수준(medium)을 유지한다.** 식단 생성은 2~6분, 중앙값 약 3분, 식단 생성 호출 약 170~400 Neuron(회차 전체 약 400~430). [실험 기록](experiments/2026-11-07-b11-thinking-level.md)

**불가능한 프로필 사전 점검 (2026-11-08, B15):** 배포본 사용자의 생성 지연·실패(T8-6)는 외식 메뉴가 적어 규칙을 모두 지키는 식단표가 없는 프로필 때문이었다. 사전 점검(4.3)을 넣은 뒤 같은 모양의 페르소나 F는 만들기가 4초 만에 `infeasible`(식단 LLM 없음)로 끝났고, 메뉴가 적지만 가능한 페르소나 G는 같은 메뉴 3번 규칙으로 gemma 161초, 242 Neuron에 첫 생성 통과했다 ([기록](experiments/2026-11-08-b15-infeasible-profile.md)).

- 개발 메모: Windows의 Git Bash에서 `curl -d '한글'`로 보내면 본문이 깨진다. 요청 본문은 UTF-8 파일로 만들어 `--data-binary @파일`로 보낸다.
