# 작업 목록

스펙(`docs/diet-coach-spec.md`) 9장 구현 순서를 task로 나눈 목록이다. 무엇이 맞는지는 스펙이, 무엇을 어떤 순서로 할지는 이 문서가 맡는다. task를 끝내면 체크하고, 새로 생긴 일은 알맞은 자리에 추가한다.

## 완료 (2026-11-04)

- [x] 기획서 피드백 반영, 스펙 작성과 리뷰 반영 (v2)
- [x] Flue + Cloudflare Workers 뼈대, Workers AI(gemma) 연결
- [x] `buildCriteria`, `checkPlan`(규칙 12개), `formatCheckSummary` (스펙 9장 1~4단계)
- [x] 메모리 `Storage`와 계약 테스트
- [x] 실제 호출 측정: 모델 gemma 선택, 1주일 생성 방식 B 확정 (스펙 11.5)
- [x] 메뉴 다양성 규칙 (`same_meal_consecutive_days`, `menu_weekly_limit`, `menuKey`)
- [x] `CLAUDE.md`

## 작업 묶음

한 번에 이어서 처리할 단위다. "이어서 하자"고 하면 첫 미완료 task가 속한 묶음을 끝까지 진행한다. 실제 모델 확인은 묶음마다 마지막에 한 번만 한다.

| 묶음 | task | 묶은 이유 | 실제 모델 확인 |
| --- | --- | --- | --- |
| B1. 식단표 화면 | T2-1, T2-2, T2-3 | 도구 결과 모양은 화면에 맞춰 정해야 해서 따로 끝내면 다시 고친다. 화면 개발 중에는 `FakePlanGenerator`와 `persona-a` 픽스처를 쓰는 개발용 설정으로 4분 대기와 Neuron 소모를 피한다 | 마지막에 1회. 약 4분, 약 250 Neuron |
| B2. 칸별 다시 추천 | T2-4 | 시작 전 결정할 열린 질문(프로필·메뉴 분류 변경 시 저장된 식단표 처리)이 있고, `editPlanCells` 흐름과 알림 세 가지가 따로 크다 | B1 식단표의 칸 하나 수정. 1분 이상, 수십 Neuron |
| B3. 인터뷰 로직 | T4-1, T4-2, T4-3 | 모두 LLM 없는 순수 로직 TDD. 프로필 검증 → 다음 질문 → 턴 분기가 이어진다 | 없음 |
| B4. 인터뷰 | T4-4, T5-1 | 인터뷰 입력 방식과 화면을 함께 정한다. 시작 전 열린 질문 4(인터뷰 상태 표현)를 정한다 | 목표 메모 확인 3회 + 화면으로 끝까지 1회 |
| B5. 메뉴 분류 | T3-1, T5-4 | 분류 결과 모양과 분류 확인·바꾸기 화면을 함께 정한다 | 페르소나 A 분류 1회 |
| B6. 나머지 화면 | T5-2, T5-3, T5-5 | 프로필 확인 → 기간 선택 → 첫 화면 분기가 한 흐름이다. 끝나면 T5 전체 완료 기준을 확인한다 | 인터뷰부터 식단표까지 1회. 약 5분 이상, 약 300 Neuron |
| B7. D1 저장소 | T6-1 | 단독 | 없음 |
| B8. 한도 보호 | T7-1, T7-2, T7-3 | 모두 요청 앞단의 보호 장치라 같은 미들웨어 자리에 들어간다 | 없음 |
| B9. 첫 배포 | T7-4 | 바깥에 공개하는 일이라 따로 확인받고 진행한다 | 배포 후 1회 |
| (보류) 평가 세트 확장 | T1-7 | 열린 질문 1(태그 제한 값)이 정해져야 시작한다. 하루에 한 번만 돌린다 | 8회. 약 35분, 약 2,200 Neuron |

순서: B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9. T1-7은 열린 질문 1이 정해지면 하루 한도가 넉넉한 날에 끼워 넣는다.

## 할 일

### T0. 준비

- [x] **T0-1. valibot 직접 의존성 추가** (2026-11-06)
  - 지금은 Flue를 거쳐 간접 설치돼 있다. LLM 스키마에서 직접 쓰기 전에 `package.json`에 넣는다.
  - Flue 2.3.0이 쓰는 것과 같은 `^1.5.0`으로 넣어 한 벌만 설치되게 했다. Flue를 올릴 때 버전을 함께 맞춘다.
  - 완료 기준: `dependencies`에 `valibot`, 빌드·테스트 통과

### T1. 식단표 생성 루프 (9장 5단계)

- [x] **T1-1. LLM 포트와 가짜 구현** (스펙 4.3, 4.4) (2026-11-06)
  - `generatePlan`, `regenerateCells`를 인터페이스로 두고, 테스트용 가짜 구현을 만든다. 각 호출은 칸과 토큰 사용량을 돌려준다.
  - `src/core/plan-generator.ts`(`PlanGenerator`, `LlmResult`, `TokenUsage`), `__fixtures__/fake-plan-generator.ts`(`FakePlanGenerator`)
  - 완료 기준: 루프 테스트에서 가짜 구현으로 호출 순서와 인자를 확인할 수 있음
  - 선행: T0-1

- [x] **T1-2. Neuron 계산** (스펙 11.4) (2026-11-06)
  - 토큰 수 × 모델별 단가. Flue의 `usage.cost`는 Workers AI에서 0이라 쓰지 않는다.
  - `src/core/neurons.ts`(`estimateNeurons`, `totalNeurons`), 단가는 `src/agents/models.ts`의 `NEURON_PRICES`. 단가를 모르는 모델은 0으로 세지 않고 에러
  - Flue가 돌려주는 `usage`의 모델 이름이 `NEURON_PRICES` 키와 같은 모양인지는 T1-5에서 확인한다
  - 완료 기준: gemma, glm 단가로 계산하는 단위 테스트 통과

- [x] **T1-3. 점검·다시 추천 루프** (스펙 4.4) (2026-11-06)
  - `src/core/plan-loop.ts`(`createPlan`, `editPlanCells`). 해석한 세부 규칙은 스펙 4.4 "구현 세부"
  - 리뷰 반영(2026-11-06): `generatePlan`은 칸만 돌려주고 Plan은 루프가 조립, 에러 시 사용량을 붙인 `PlanLoopError`, 고른 칸이 다시 대상이면 `userRequest` 전달, `changed`/`unchangedTargets`, 고를 수 없는 칸 거절, 한도 초과 판별을 숫자만으로 하지 않기, 단가표 `Object.hasOwn`과 `max-price` 정책
  - 완료 기준 (가짜 LLM으로 TDD):
    - `unexpected_cell` 칸은 코드가 지운다
    - 나머지 위반의 `regenerate`를 중복 없이 모아 그 칸만 다시 요청한다
    - 최대 3회. 넘으면 식단표를 내보내지 않고 위반 원인을 돌려준다
    - 사용자 칸 수정 요청이 실패하면 수정 전 식단표를 그대로 둔다
  - 선행: T1-1

- [x] **T1-4. 한도 초과 처리** (스펙 11.3) (2026-11-06)
  - 완료 기준: 한도 초과 에러가 나면 루프가 즉시 멈추고 재시도 횟수로 세지 않는 테스트 통과
  - `isQuotaExceeded` 판별은 임시 구현으로 두고, 실제 에러를 본 뒤 확정한다 (열린 질문 6)
  - `src/core/quota.ts`. 루프는 `QuotaExceededError`만 보고 `reason: 'quota'`를 돌려준다. 칸 수정이면 수정 전 식단표를 함께 돌려준다
  - 선행: T1-3

- [x] **T1-5. Flue로 실제 생성 연결** (스펙 4.3) (2026-11-06)
  - `PlanCell` valibot 스키마, 다양성 규칙이 들어간 프롬프트, `harness.prompt(..., { result })`
  - 어댑터는 Flue 에러를 `isQuotaExceeded`로 판별해 `QuotaExceededError`로 바꿔 던진다. Flue의 스키마 재요청이 한도 초과에서도 다시 부르는지 확인한다 (스펙 11.3-2)
  - Flue `usage`의 모델 이름을 `NEURON_PRICES` 키 모양으로 맞춘다. Flue는 `{ provider, id }`로 나눠 주므로 `${provider}/${id}`로 잇는다. 운영 경로에서는 `estimateNeurons`를 `{ unknownModel: 'max-price' }`와 경고로 부른다
  - Flue 에러에서 실패한 호출의 부분 사용량(스키마 재요청으로 쓴 토큰)을 얻을 수 있는지 확인한다. 지금 `PlanLoopError.usages`에는 성공한 호출만 들어 있다
  - 완료 기준: 개발 서버에서 페르소나 A 1주일 식단표 1회 생성 → `checkPlan` 통과. 약 200 Neuron
  - 선행: T1-3
  - 결과: 4분 27초, 약 250 Neuron, 처음에 통과(다시 추천 0회). 측정과 관찰은 스펙 11.5
  - 코드: `core/plan-prompt.ts`(프롬프트, `normalizeMenuId`), `agents/plan-schema.ts`, `agents/flue-plan-generator.ts`, `agents/create-plan-tool.ts`(`create_week_plan`, 페르소나 A 고정, 결과로 턴 종료)
  - 남은 확인: 한도 초과 에러 모양과 Flue 재시도(열린 질문 6), 실패한 호출의 부분 사용량. 실제로 마주쳤을 때 확인한다

- [x] **T1-6. 평가 세트 설정** (스펙 8.5) (2026-11-06)
  - `vitest.evals.config.ts`, `npm run evals`. 페르소나 A 케이스부터
  - 완료 기준: 페르소나 A 1회 실행. 한도 초과는 "건너뜀"으로 기록
  - 선행: T1-5
  - `src/evals/plan-generation.eval.ts`: 개발 서버에 HTTP로 보낸다(Workers AI 바인딩이 Cloudflare 환경에만 있어 `start()`를 못 씀). 회차마다 도구 결과의 식단표를 `checkPlan`으로 다시 점검하고, 마지막 케이스가 통과율(7/8 이상)을 판정한다. 결과는 `evals-results/*.json`(git 제외)
  - 결과: 페르소나 A 1회 통과. 3분 51초, 약 274 Neuron, 다시 추천 0회 (스펙 11.5)

- [ ] **T1-7. 평가 세트 페르소나 2~4** (스펙 8.5)
  - B5부터 평가 세트는 회차마다 인터뷰 제출(메모 없음) → 메뉴 분류 → 식단표 만들기를 보낸다(`src/evals/support/prepare.ts`). 분류는 픽스처 값으로 바꿔 보내 점검 기준을 고정한다. 페르소나 2~4의 프로필과 메뉴 분류 픽스처를 더하면 된다
  - 페르소나별 2회 = 8회. 약 2,400 Neuron(회차마다 분류 약 50 포함), 약 35분. 하루에 한 번만 돌린다
  - 잘못된 입력 케이스(8.5 표)는 인터뷰(T4-4) 뒤에 추가한다
  - 선행: T1-6, 태그 제한 값 확정(열린 질문 1)

### T2. 식단표 화면 먼저 (9장 5-1단계)

시연의 핵심 장면과 약 3분 기다리는 경험을 일찍 확인하려고 인터뷰보다 앞당겼다. 프로필은 페르소나 A로 고정한다.

- [x] **T2-1. React 설정** (스펙 7.1) (2026-11-06)
  - `react`, `react-dom`, `@vitejs/plugin-react`, `@flue/react`, `@flue/sdk`. Vite 설정, `wrangler.jsonc`의 정적 자산과 SPA 라우팅, `src/ui/` 진입점
  - 완료 기준: 개발 서버에서 `/`는 React 페이지, `/api/ping`은 `pong`. `npm run build` 통과
  - 선행: T0-1
  - `@flue/react`·`@flue/sdk`는 runtime과 같은 2.3.0. `assets`는 `not_found_handling: single-page-application`, `run_worker_first: ["/api/*", "/agents/*"]`(디렉터리는 Cloudflare Vite 플러그인이 정함)

- [x] **T2-2. 식단표 생성 도구** (스펙 4.3, 4.4, 7.1) (2026-11-06)
  - 에이전트에 식단표를 만드는 도구를 붙인다. 도구 안에서 점검·다시 추천 루프를 돌리고, `Plan`과 점검 요약을 도구 결과로 돌려준다
  - 완료 기준: 개발 서버에서 대화로 호출하면 도구 결과에 `checkPlan`을 통과한 `Plan`이 남음
  - `createPlan`의 `planId`, `createdAt`은 도구에서 만든다. 결과의 `usages`와 `PlanLoopError.usages`는 성공·실패와 관계없이 사용량으로 센다
  - 선행: T1-5
  - 결정: 도구 결과 모양은 `core/plan-tool-output.ts`의 `PlanToolOutput`(도구, 화면, 평가 세트가 함께 씀). `ok`에 `notices`(`core/plan-notices.ts`의 `buildPlanNotices`: 의료 조언 아님 + 약 복용 시 상담 권고)를 더했다
  - 결정: 도구 입력에서 `weekStart`를 뺐다. gemma가 오늘 날짜(금요일)를 넣은 적이 있다. 시작일은 `nextMondayKst`, 기간 선택(T5-3)이 생기면 그쪽 값을 쓴다
  - 결정: 바깥 턴 사용량은 `useResponseFinish`로 응답 metadata(`usage`)에 남긴다. 이 값에는 도구 안 `harness.prompt` 사용량이 들어가지 않으므로 하루 사용량은 "응답 사용량 + 도구 `stats.usages`"로 센다 (T7-3). 실측 바깥 턴 약 2 Neuron
  - 개발용 가짜 모드: `.dev.vars`에 `PLAN_GENERATOR=demo`면 `agents/demo-plan-generator.ts`(페르소나 A 칸을 5초 뒤 돌려줌). 바깥 턴은 실제 모델

- [x] **T2-3. 식단표 화면** (스펙 7장) (2026-11-06)
  - "식단표 만들기" 버튼 → 기다리는 화면(경과 시간) → 식단표(이유, 주문 팁, 점검 요약, 의료 조언 아님 안내)
  - 넓은 화면은 요일 × 끼니 표, 휴대폰 폭은 요일별 카드
  - 완료 기준: 개발 서버에서 버튼을 누르면 약 3분 뒤 식단표가 보이고, 새로고침이나 창을 닫았다 열어도 진행 상태나 결과가 이어짐
  - 선행: T2-1, T2-2
  - 결과: 실제 모드 1회 3분 7초, 약 288 Neuron, 처음에 통과 ([실험 기록](experiments/2026-11-06-b1-ui-real-run.md)). 새로고침 이어짐과 휴대폰 폭 카드는 가짜 모드로 확인
  - 코드: `ui/plan-view-state.ts`(대화 → 화면 상태, 테스트 있음), `ui/plan-layout.ts`(요일 × 끼니 배치), `App.tsx`, `WaitingView.tsx`, `PlanBoard.tsx`, `styles.css`. 대화 ID는 `localStorage`, 시작 시각은 사용자 메시지의 서버 시각
  - 디자인: `frontend-design` skill로 기본안(구내식당 주간 메뉴판 모티프), `web-design-guidelines`로 점검. 보면서 바꿀 예정
  - 화면 폭: 1024px 이상은 요일 × 끼니 표, 641~1023px(태블릿)은 요일 카드 2열, 640px 이하(휴대폰)는 1열. 7열 표는 태블릿에서 칸이 너무 좁다. Chrome에서만 확인했고 Safari·삼성 인터넷은 실기기 확인 전
  - 대화 ID는 `ui/conversation-id.ts`. `crypto.randomUUID`가 없는 http 사설 주소(휴대폰으로 개발 서버 확인)에서는 `getRandomValues`로 만든다. 휴대폰으로 볼 때는 `npm run dev -- --port 5199 --host`
  - 빠진 것: "몇 칸을 다시 고르는 중" 안내. 도구의 `log` 이벤트는 클라이언트가 읽는 대화에 나오지 않는다 (아래 "나중에")

- [x] **T2-4. 칸별 "다시 추천"** (스펙 4.4-4) (2026-11-06)
  - `editPlanCells` 결과의 `changed`에 고르지 않은 칸이 있으면 "다른 칸도 바꿨어요", `unchangedTargets`가 있으면 "요청을 반영하지 못했어요"를 알린다. `invalid_targets`는 고를 수 없는 칸이라고 알린다
  - 완료 기준: 칸 하나를 바꿔 달라고 하면 그 칸만 바뀌고, 실패하면 원래 식단표가 그대로 남음
  - 선행: T2-3
  - 결정(열린 질문): 칸 수정 전에 수정 전 식단표를 지금 조건으로 `checkPlan`해서 위반이면 LLM 없이 `stale_plan`으로 막고 새로 만들라고 안내한다 (스펙 4.4 구현 세부)
  - 결정: 화면은 `칸 다시 추천: 화요일 점심` / `원하는 점: …` 형식 메시지를 보내고(`core/edit-request.ts`), `edit_plan_cells` 도구가 `useDelivery()`로 직접 해석한다. 모델은 칸이나 요청을 옮겨 적지 않는다. 고칠 식단표는 `usePersistentState('plan')`(만들기·칸 수정이 성공하면 저장)
  - 결정: 칸은 한 번에 하나. 원하는 점을 비우면 "다른 메뉴로 바꿔 주세요"
  - 코드: `agents/edit-plan-tool.ts`, `agents/plan-tool-support.ts`(두 도구 공용), `core/plan-tool-output.ts`의 `EditToolOutput`, `ui/plan-view-state.ts`(마지막 성공 식단표 + `editing`/`editNotice`), `PlanBoard.tsx`(칸마다 다시 추천, 입력 펼침, 수정 중 경과 시간, 바뀐 칸 강조)
  - 결과: 실제 1회 토요일 저녁만 바뀜, 57초, 약 115 Neuron(바깥 턴 약 21 별도) ([실험 기록](experiments/2026-11-06-b2-edit-real-run.md)). 가짜 모드로 "요청을 반영하지 못했어요"와 수정 중 새로고침 확인

### T3. 메뉴 분류 (9장 6단계)

- [x] **T3-1. `classifyMenus`** (스펙 1.3, 4.2) (2026-11-06)
  - 완료 기준: 분류 대상 목록과 1:1인지 확인하는 검증을 TDD로, LLM 구현은 페르소나 A로 1회 확인
  - 선행: T1-5
  - 결정: 1:1 검사는 결과 스키마의 `v.check`(Flue가 틀린 메뉴를 알려 주며 다시 요청) + 받은 뒤 코드에서 한 번 더. 기준 밖 `criterionIds`는 다시 요청하지 않고 지운다. 외식 끼니가 없으면 LLM 없이 빈 분류 (스펙 4.2 구현 세부)
  - 결정: 모델은 llama-4-scout, `thinkingLevel: 'low'`. `.dev.vars`의 `MENU_MODEL`로 바꿔 시험, `MENU_CLASSIFIER=demo`면 `classesA`를 쓰는 가짜 분류기
  - 결정: `classify_menus` 도구는 `메뉴 분류 요청` 메시지에 불리고 결과를 `usePersistentState('menuClasses')`에 둔다. 식단표 도구는 페르소나 A 고정을 없애고 끝난 인터뷰(`profileFromInterview`, `userId: 'demo'`) + 확인된 분류로 만든다
  - 코드: `core/menu-classification.ts`, `core/menu-classifier.ts`(`runClassification`), `core/plan-request.ts`, `agents/menu-schema.ts`, `agents/flue-menu-classifier.ts`, `agents/demo-menu-classifier.ts`, `agents/classify-menus-tool.ts`
  - 결과: 실제 1회 한 번에 1:1, 분류 7초 약 65 Neuron(바깥 턴 14 별도). 국밥을 often으로 나눴고 백반·회덮밥은 이유가 성의 없음 ([실험 기록](experiments/2026-11-06-b5-menu-classify.md))
  - 평가 세트(`plan-generation.eval.ts`)는 B4부터 새 대화가 인터뷰 중이라 돌지 않았다. 인터뷰 제출 → 분류 → 만들기 순서로 고쳤다(실제 실행은 아직 안 함)

### T4. 인터뷰 (9장 7단계)

- [x] **T4-1. 프로필 검증** (스펙 1.2) (2026-11-06)
  - 완료 기준: `meals` 6개 조합, 외식 끼니의 `menus`, `goals`, 동의 시각 검증 테스트 통과
  - 결정: 에러를 던지지 않고 `ProfileIssue[]`(`{ code, meal? }`)를 돌려준다. 비면 통과. 프로필 확인 화면(T5-2)이 항목별로 보여 준다. code 목록과 순서는 스펙 1.2
  - 결정: 혈당·콜레스테롤 목표가 없는데 `medication`이 `none`이 아니면 `medication_without_goal`
  - 코드: `core/profile-validation.ts`, 끼니 6개 조합 순서는 `helpers.ts`의 `MEAL_KEYS`

- [x] **T4-2. `nextField`** (스펙 4.1) (2026-11-06)
  - 완료 기준: 약 복용 질문 건너뛰기, 외식·집밥 끼니별 조건부 질문, 끝나면 `null`을 확인하는 테스트 통과
  - 결정: 초안은 `InterviewDraft`. 조리 시간 "상관없다"는 `cookMinutes: null`, 피할 음식 "없음"은 `avoid: []`. `undefined`는 아직 묻지 않음
  - 결정: `medication`은 건너뛰기만 하고, `"none"`은 인터뷰가 끝날 때(`finishDraft`) 채운다. 목표가 바뀌어도 값이 꼬이지 않는다
  - 코드: `core/interview.ts`(`nextField`, `mergeDraft`: 끼니는 `(dayType, meal)`끼리 필드 단위로 병합, `finishDraft`)

- [x] **T4-3. 턴 분기 1~7** (스펙 4.1) (2026-11-06)
  - 완료 기준: 중단 플래그, 극단적 목표, 미지원 목표, 범위 밖 질문, 모호한 답, 외식 메뉴 부족, 인터뷰 끝 분기 테스트 통과
  - 결정: `applyTurn(state, update) → { state, next, notices }`. 문구 없이 code만 돌려준다. 문구는 T4-4에서 정한다
  - 결정: `InterviewState`에 `menuFollowUps`(메뉴를 한 번 더 물어본 끼니)를 더했다. 두 번째에는 그대로 진행한다
  - 결정: 우선순위는 중단 → 극단적 목표(이번 답 버림, LLM 선택지) → 미지원 목표(코드가 지원 목표 3개 선택지) → 모호함(그 필드만 빼고 반영) → 메뉴 부족 → 다음 질문/끝. 범위 밖 질문은 `notices`로 어느 분기와도 함께 나온다
  - 코드: `core/interview-turn.ts`, 목표 라벨은 `labels.ts`의 `GOAL_LABELS`

- [x] **T4-4. 인터뷰 제출과 목표 메모 확인** (2026-11-06)
  - 인터뷰 상태를 Flue에서 어떻게 들고 있을지 먼저 정한다 (열린 질문 4)
  - 완료 기준: 개발 서버에서 기획서 예시 답으로 인터뷰를 끝까지 진행해 프로필 생성
  - 선행: T4-1 ~ T4-3
  - 처음 계획(매 턴 LLM이 답을 `InterviewUpdate`로 옮김)은 실제로 재 보니 턴당 약 150~240 Neuron, 1~2.5분이라 버렸다. 추론 수준(`off`는 Workers AI에 전달 안 됨, `low`)과 추론 없는 모델(granite 형식 거부, mistral 포기, llama-4-scout 입력 단가 높음)도 효과가 없었다 ([실험 기록](experiments/2026-11-06-b4-interview-real-run.md))
  - 결정: 정해진 답은 화면 입력으로 받고 코드가 `InterviewUpdate`를 만든다(`core/interview-form.ts`). 단계마다 브라우저에서 `applyTurn`. 끝나면 `인터뷰 제출:` 메시지 한 번, `submit_interview` 도구가 `useDelivery()`로 읽는다. 결과만 `usePersistentState('interviewResult')`
  - 결정: LLM은 목표 메모가 있을 때 제출 시 1회만(`core/interview-note.ts`, llama-4-scout, `thinkingLevel: 'low'`). 중단 사유는 체크박스. 문장은 코드 템플릿(`interview-text.ts`), `InterviewUpdate.reply`는 없앴다
  - 결정: 인터뷰 중에는 제출 도구만, 끝난 뒤에는 식단표 도구만 마운트. 인터뷰 중 바깥 턴은 `thinkingLevel: 'low'`(식단표 단계는 기본값)
  - 결과: 메모 확인 3회 모두 맞게 분류(보통 → done, "한 달에 10kg" → 목표 다시·선택지, "근육" → 지원 목표 3개). 제출 1회 4~6초, 약 48~50 Neuron(바깥 턴 포함). 메모가 없으면 바깥 턴만(약 10)
  - 코드: `core/interview-runner.ts`(`submitInterview`), `agents/interview-tool.ts`, `agents/flue-goal-note-checker.ts`, `agents/interview-schema.ts`. 추출 모델은 `.dev.vars`의 `INTERVIEW_MODEL`로 바꿔 시험할 수 있다(`models.ts`의 `goalNoteModel`)

### T5. 나머지 화면 (9장 8단계)

- [x] **T5-1. 인터뷰 화면** (스펙 7장) (2026-11-06)
  - 단계별 입력: 목표(체크박스, 메모, 중단 사유), 약(버튼), 피할 음식(체크박스, 없음, 메모), 끼니 표(6줄, 장소 라디오, 같이 먹는 사람), 외식 메뉴(입력칸, 적으면 "더 없음"), 조리 시간(버튼)
  - 선행: T4-4
  - 코드: `ui/InterviewView.tsx`, `ui/InterviewSteps.tsx`, `ui/interview-form-state.ts`(localStorage 진행, 서버 ask 이어받기, 테스트), `ui/interview-view-state.ts`(제출 결과 → 화면, done 뒤 메시지는 식단표 화면으로)
  - 결과: Chrome에서 페르소나 A 답으로 끝까지 → 약 10초 뒤 요약과 "식단표 만들기". 메뉴 2개면 한 번 더 묻기, 새로고침 이어짐 확인
  - "이전" 버튼은 없다(고치기는 T5-2). B5부터 식단표는 인터뷰 결과로 만든다
- [ ] **T5-2. 프로필 확인 화면**
  - 프로필 표, 식단 기준, 항목별 수정, 저장 동의
  - 선행: T4-1
- [ ] **T5-3. 기간 선택 화면**
  - 1주일 선택, 정해진 일정(회식, 약속) 입력
- [x] **T5-4. 메뉴 분류 확인 화면** (2026-11-06)
  - 분류 표, 분류 바꾸기
  - 선행: T3-1
  - 결정: 인터뷰 끝 요약 화면의 "외식 메뉴 분류하기" 버튼 → 분류 중 → 분류 확인. 메뉴마다 라디오 3개(자주 먹어도 됨, 주 1회까지, 피하기), 바꾼 메뉴는 "바꿈"과 처음 분류를 보여 준다. 고르는 값은 localStorage(대화 ID별). "이 분류로 식단표 만들기"가 `식단표 만들기:` 메시지에 바꾼 분류를 싣는다
  - 결정: 바꾼 메뉴의 이유는 "직접 정한 분류"로 바꾼다(LLM 이유와 어긋나지 않게). 모든 메뉴를 피하기로 고르면 만들기를 막는다
  - 코드: `ui/menu-class-view-state.ts`(테스트 있음), `ui/MenuClassView.tsx`, `App.tsx`, `styles.css`. 761px 이상은 메뉴 | 분류 | 이유 3열, 그보다 좁으면 카드
  - 결과: 가짜 모드 두 가지로 Chrome에서 인터뷰 제출 → 분류 → 돈가스를 often으로 바꿈 → 식단표까지 확인(점검 요약의 주 1회 메뉴에서 돈가스가 빠짐). 새로고침 이어짐, 390px 폭 카드 확인
- [ ] **T5-5. 첫 화면 분기**
  - 저장된 프로필이 있으면 "지난 프로필로 시작 / 바뀐 항목 고치기"
- 완료 기준(T5 전체): 개발 서버에서 기획서 예시 사용자로 인터뷰부터 식단표까지 화면으로 끝까지 진행

### T6. D1 저장소 (9장 9단계)

- [ ] **T6-1. `D1Storage`** (스펙 5장)
  - 완료 기준: `storageContract('D1Storage', ...)` 계약 테스트 통과 (`@cloudflare/vitest-pool-workers`)

### T7. 한도 보호 (9장 10단계, 배포 전 필수)

- [ ] **T7-1. 사용자 토큰 확인** (스펙 11.4-1)
  - 완료 기준: 토큰이 없거나 틀리면 401. 토큰은 해시로만 저장. 대화 ID는 토큰에서 정함
- [ ] **T7-2. 사용자별 하루 호출 제한** (스펙 11.4-2)
  - 완료 기준: 제한을 넘으면 429와 한도 안내
- [ ] **T7-3. 전체 하루 Neuron 안전선** (스펙 11.4-3)
  - 완료 기준: 8,000 Neuron에 닿으면 새 요청은 막고 진행 중인 요청은 끝까지 처리
  - 선행: T1-2
- [ ] **T7-4. 첫 배포**
  - 선행: T7-1 ~ T7-3, T6-1

## 결정이 필요한 것 (스펙 10장)

| 열린 질문 | 언제까지 |
| --- | --- |
| 1. 태그 제한 값 확정 | 평가 세트를 여러 페르소나로 돌리기 전 (T1-7). T1-6은 초안 값으로 페르소나 A만 돌렸다 |
| 3. LLM 태그를 믿을 수 있는지 | T1-6 평가 결과를 보고 |
| 6. 한도 초과 에러 형태 | T1-4 임시 구현 뒤, 실제 에러를 봤을 때 |

## 나중에

- 이름은 다르지만 주재료가 같은 메뉴의 반복 제한 (예: 닭가슴살 샐러드, 닭가슴살 볶음)
- 기다리는 화면의 "몇 칸을 다시 고르는 중" 안내 (스펙 7장). 도구 `log`는 대화에 안 나오므로 `useDataWriter` 같은 다른 통로가 필요하다. 지금까지 다시 추천 0회라 미뤘다
- "새로 만들기"를 누르면 지금 식단표를 다시 볼 방법이 없다 (대화 ID만 바뀜). 저장(T6)이나 지난 식단표 목록이 생길 때 함께 정한다
- 바깥 턴 문맥이 대화마다 커진다: 도구 결과의 식단표 JSON이 다음 턴 모델 입력에 다시 들어간다(칸 수정 턴 입력 2,234토큰). 모델에게는 짧은 요약만 보이게 할 방법을 찾는다
- 가짜 모드 확인 중 만들기 응답이 2분 늦게 시작한 적이 있다(오류 없음). 다시 보이면 원인을 찾는다
- 메뉴 분류 품질: 국밥을 often으로 나눴고 이유가 "일반적인 식사라 식단 기준에 부합함"처럼 성의 없는 메뉴가 있다(B5 실제 1회). 프롬프트에서 메뉴마다 근거 기준과 주문 팁을 꼭 쓰게 하거나 gemma와 비교한다
- 모든 메뉴를 피하기로 고르는 것만 막는다. 외식 끼니가 여러 개면 한 끼니의 메뉴가 모두 피하기여도 만들 수 있고, 그러면 점검에서 실패한다. 끼니별로 막을지 정한다
- 제목에 주문 팁이 괄호로 들어가 주문 팁 칸과 겹친다("백반 (생선 반찬 고르기)"). 프롬프트에서 제목은 메뉴 이름만 쓰게 할지
- 첫 시연 이후 기능: 하루 재조정, 레시피, 지난주 체크 반영, 근육 증가 목표, 도시락
