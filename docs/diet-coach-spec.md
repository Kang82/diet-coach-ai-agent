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
- 정규화(앞뒤 공백 제거, 괄호 설명 제거)는 LLM 출력 검증 단계에서 한다. `checkPlan`은 정규화된 값을 받는다고 가정하고 정확히 일치하는지만 비교한다.

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
  consecutiveCount: number;                            // 연속된 같은 메뉴 쌍의 수
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

> 태그 제한 값은 초안이다. 일반 영양 지침을 확인해 확정한다 (열린 질문 1).

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
| `consecutive_menu` | 이어진 두 칸의 `menuId`가 같음 | 이어진 쌍마다 1개 | 뒤쪽 칸 |
| `cook_time_exceeded` | 집밥 칸의 `cookMinutes`가 그 끼니 설정의 `cookMinutes`보다 큼. 설정에 값이 없으면 점검하지 않음 | 칸마다 1개 | 그 칸 |
| `reason_criterion` | 칸의 `criterionIds`가 비었거나 `rules.criteria`에 없는 값이 있음 | 칸마다 1개 | 그 칸 |

- `class_avoid`, `class_weekly_limit`은 외식 칸만 센다. 분류에 없는 메뉴는 이 두 규칙에서 무시한다(그런 메뉴는 `eat_out_not_in_list`에 걸린다).
- `unexpected_cell`로 걸린 칸은 다른 규칙의 점검과 통계에서 뺀다.

### 3.3 정렬

위반 목록은 `RuleId` 선언 순서로, 같은 규칙 안에서는 `cells[0]`의 시간순으로, 그것도 같으면 `detail`의 사전순으로 정렬한다.

## 4. 단계별 입출력

### 4.1 인터뷰

인터뷰 상태는 지금까지 채운 프로필 초안과 중단 플래그만 가진다. 다음에 물을 질문은 상태에 저장하지 않고 순수 함수로 계산한다.

```ts
interface InterviewState {
  draft: Partial<Profile>;
  stopFlags: StopFlag[];    // 한 번 생기면 남음
}

type InterviewField =
  | "goals" | "medication" | "avoid" | "meals"
  | { menusFor: { dayType: DayType; meal: MealType } }
  | { cookMinutesFor: { dayType: DayType; meal: MealType } };

type StopFlag = "pregnancy" | "kidney_disease" | "glucose_medication";

type TurnFlag =                // 그 턴에만 처리하고 버림
  | "extreme_restriction" | "unsupported_goal"
  | "asks_lab_interpretation" | "asks_medication_advice";

interface InterviewUpdate {   // LLM이 한 턴마다 내는 값
  filled: Partial<Profile>;
  ambiguous?: { field: InterviewField; choices: string[] };
  stopFlags: StopFlag[];
  turnFlags: TurnFlag[];
  reply: string;              // 사용자에게 보여 줄 문장
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

### 4.2 외식 메뉴 분류 (LLM)

```ts
classifyMenus(profile: Profile, rules: CriteriaRules): MenuClassification[]
```

- 출력의 `menu`는 분류 대상 목록(1.3)과 1:1로 대응해야 한다. 빠지거나 추가되면 형식 오류로 보고 다시 요청한다.
- 사용자가 분류를 고치면 그 값을 그대로 쓴다.

### 4.3 식단표 만들기 (LLM)

```ts
generatePlan(input: {
  profile: Profile;
  rules: CriteriaRules;
  classes: MenuClassification[];
  weekStart: string;
  events: Plan["events"];
}): Plan
```

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

- 첫 시연 저장소 후보는 D1(테이블 `profiles`, `plans`)이다. 구현은 이 인터페이스 뒤에 숨기고, 테스트에서는 메모리 구현을 쓴다.
- 사용자 구분은 첫 시연에서 추측하기 어려운 고유 링크 토큰으로 한다. 로그인은 이후에 붙인다 (열린 질문 2).
- `consentedAt` 없이 `saveProfile`을 부르면 에러를 던진다.

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
| 인터뷰 | 대화형 질문, 모호할 때 선택지 버튼 | 프로필 확인 |
| 프로필 확인 | 프로필 표, 식단 기준, 항목별 수정, 저장 동의 | 기간 선택 |
| 기간 선택 | 1주일(첫 시연은 이것만), 정해진 일정 입력 | 메뉴 분류 확인 |
| 메뉴 분류 확인 | 분류 표, 분류 바꾸기 | 식단표 |
| 식단표 | 요일 × 끼니 표, 칸마다 이유와 주문 팁, 점검 요약, 의료 조언 아님 안내(약 복용 중이면 상담 권고 추가), 칸별 "다시 추천" | 저장 |

저장된 프로필이 있으면 첫 화면은 "지난 프로필로 시작 / 바뀐 항목 고치기" 선택이다.

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
| 7 | 목 저녁을 `events`로 옮기고 칸 삭제, 목·금 점심을 백반으로 | `consecutive_menu` cells [목 점심, 금 점심], regenerate [금 점심] |
| 8 | 수 점심 `menuId`를 짜장면으로 (태그는 `wheat`, `refined_carb_main`) | `eat_out_not_in_list` 수 점심 |
| 9 | 월 저녁 `cookMinutes` 30 | `cook_time_exceeded` 월 저녁 |
| 10 | 토 저녁 `cookMinutes` 90 | 없음 (주말 집밥은 시간 제한 없음) |
| 11 | 월 저녁 `criterionIds`에 `reduce_refined_carbs` 추가 | `reason_criterion` 월 저녁 |
| 12 | 화 저녁 칸 삭제 | `missing_cell` 화 저녁 |
| 13 | 월 아침 칸 추가 | `unexpected_cell` 월 아침, regenerate [] |
| 14 | 월 점심 칸을 하나 더 추가 (회덮밥) | `unexpected_cell` 두 번째 월 점심, regenerate []. 이 칸은 다른 규칙에서 빠지므로 `consecutive_menu` 없음 |
| 15 | 프로필 `avoid`를 `["meat"]`로, `rules`는 그대로 | `avoid_tag`가 화 저녁, 수 점심, 목 점심, 금 점심, 일 저녁 각각 (시간순 5개) (detail은 각 칸에서 걸린 태그, 예: 목 점심 `"meat,pork"`) |
| 16 | 2번 + 3번 + 9번을 함께 | `avoid_tag` → `class_weekly_limit` → `cook_time_exceeded` 순서로 3개 |

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
- 페르소나별 **2회**, 잘못된 입력 케이스는 **1회**씩 돌린다. 한 번 다 돌리면 gemma 기준 약 4,000~5,000 Neuron으로 하루 한도의 절반쯤 쓴다.
- 모델 후보 비교(11.1)는 하루에 한 모델씩 날을 나눠서 한다.
- 개발 중에는 페르소나 하나만 골라 돌릴 수 있게 한다 (`npm run evals -- -t 페르소나A`).

**페르소나:**

1. A (8.1)
2. 감량만: 평일 점심 외식(구내식당 메뉴 5개), 저녁 집밥 15분
3. 혈당 관리: 평일 점심 외식(김밥, 칼국수, 백반, 비빔밥), 저녁 집밥 30분, 약 복용 없음
4. 콜레스테롤 + 채식(`meat`, `fish`, `shellfish` 피함)

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
6. `classifyMenus`
7. 인터뷰 (`nextField`, 분기, LLM 턴)
8. React 화면 연결
9. D1 `Storage` 구현

## 10. 열린 질문

1. **태그 제한 값:** 기준 테이블의 숫자(주당 최대 횟수)를 어떤 영양 지침으로 확정할지
2. **사용자 구분:** 첫 시연에서 고유 링크 토큰으로 충분한지, 로그인이 필요한지
3. **태그를 누가 붙이나:** LLM이 칸마다 붙이는 태그를 믿을 수 있는지. 자주 나오는 메뉴는 코드에 메뉴 → 태그 사전을 두고 LLM 태그와 합치는 방식도 검토
4. **Flue 연동:** 구조화된 출력 검증과 재요청, 인터뷰 상태를 Flue 안에서 어떻게 표현할지 (포럼 기능 질문과 연결)
5. **JSON 출력 강제:** 후보 모델 두 개 모두 `response_format` 파라미터가 있지만, Cloudflare 문서에 JSON 스키마를 강제할 수 있는지는 나와 있지 않다. 강제가 안 되면 프롬프트 지시 + 스키마 검증 + 재요청(1장)에 기댄다. 5단계 시작할 때 실제 호출로 확인한다.
6. **한도 초과 에러 형태:** Workers AI가 무료 한도를 넘었을 때 돌려주는 에러를 어떻게 구분할지 (11.3). 실제 에러를 보고 판별 함수를 확정한다.

## 11. LLM 모델과 사용량 (Cloudflare Workers AI)

비용 없이 첫 시연까지 가기 위해 Cloudflare Workers AI의 무료 한도 안에서 쓰는 모델만 쓴다. Flue의 `cloudflare/...` 모델을 쓰고, `wrangler.jsonc`의 `AI` 바인딩으로 호출한다. API 키는 필요 없다.

### 11.1 모델

| 후보 | 모델 ID | 컨텍스트 | 함수 호출 |
| --- | --- | --- | --- |
| gemma (기본값) | `cloudflare/@cf/google/gemma-4-26b-a4b-it` | 256K | 지원 |
| glm | `cloudflare/@cf/zai-org/glm-4.7-flash` | 131K | 지원 |

- 모델 ID는 `src/agents/models.ts`에만 두고, 에이전트는 이 값을 가져다 쓴다.
- 8.5 평가 세트로 두 후보를 비교해 최종 모델을 정한다. 비교 기준은 스키마 통과율, `checkPlan` 통과율, 1회 사용 Neuron, 한국어 이유 문장의 자연스러움(사람이 확인)이다.
- 무료로 쓸 수 없는 모델(Kimi K2.6, GLM-5.x, DeepSeek V4)은 쓰지 않는다.

### 11.2 무료 한도와 사용량 예산

- 하루 10,000 Neuron. 매일 00:00 UTC(한국 시각 오전 9시)에 초기화된다.
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
3. 사용자에게는 "오늘 사용할 수 있는 양을 다 썼어요. 오전 9시 이후에 이어서 할 수 있어요."를 보여 준다.
4. 그때까지 확인받은 프로필은 이미 저장돼 있으므로(4.1) 다음에 열면 인터뷰를 다시 하지 않는다. 만들던 식단표는 저장하지 않는다.
5. 평가 세트 실행 중에 한도 초과가 나면 그 케이스를 실패가 아니라 "건너뜀"으로 기록하고 실행을 멈춘다.
