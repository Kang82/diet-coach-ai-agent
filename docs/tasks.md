# 작업 목록

스펙(`docs/diet-coach-spec.md`) 9장 구현 순서를 task로 나눈 목록이다. 무엇이 맞는지는 스펙이, 무엇을 어떤 순서로 할지는 이 문서가 맡는다. task를 끝내면 체크하고, 새로 생긴 일은 알맞은 자리에 추가한다.

## 현재 상태 (2026-11-08 02시 기준)

다음에 이어서 할 때 이 절부터 읽는다. 상태가 바뀌면 고친다.

**끝난 것**
- B1~B9: 식단표 생성·화면·인터뷰·메뉴 분류·D1 저장·한도 보호·첫 배포. 배포 주소 https://diet-coach.jjangyeesoo1.workers.dev (원격 사용자 토큰 1개 발급, 링크는 사용자가 가지고 있다)
- B10(T8-1): 배포본 로그 수집. Workers Logs에 요청·Durable Object 스팬이 남고 토큰 값은 남지 않는다
- B10a(T8-4, T7-5): 식단 도구 전체 시간 예산(만들기 10분, 칸 수정 5분), 추론 수준 설정 `PLAN_THINKING`, 전체 안전선을 최근 24시간 합계(`usage_hourly`)로
- B10b(T9-1~6): B5·B6 리뷰 남은 버그 6건
- B10c(T8-5): durable 도구 문서·소스 조사와 데모 생성기 실험. durable이면 끊긴 step만 다시 돌아 결과가 남는다. B12는 한다 ([조사 기록](experiments/2026-11-07-b10c-durable-tools.md))
- T10-1: 배포 전 코드·보안 리뷰(서브 에이전트)에서 나온 작은 수정. 트레이스 내용 끄기, 메시지 본문 32KB·첨부 거절, 마이그레이션 0003 옮기는 칸, 예산 안 시간 초과 처리, NaN 사용량
- **두 번째 배포(11-07 12시경 KST)**: 원격 D1에 0003 적용 → 바로 배포(버전 `acb85cd8`, 커밋 `714ba61`까지). 원격 `usage_hourly`에 오늘·어제 합계 약 2,256이 `2026-11-07T03` 칸으로 옮겨졌다. ping 200, 토큰 없음 401 확인
- 열린 질문 1(태그 제한 값)은 초안 값으로 확정(근거는 스펙 2장). 열린 질문 6(한도 초과 에러 형태)은 실제 에러로 확인
- T1-7(23시경): 평가 세트 페르소나 A~D 8회 중 8회 통과. 저녁 B·C·D 6회에 약 2,400 Neuron(로컬 카운터). 
- B11(T8-2, 11-08 0시경): 식단 생성 추론 수준 low도 8/8 통과지만 출력 토큰 중앙값 -7%, 시간 같음 → 기본값(medium) 유지 ([실험 기록](experiments/2026-11-07-b11-thinking-level.md)). 약 3,460 Neuron. GraphQL 최근 24시간 합계 7,068(11-08 0:39 KST). **11-08 10시(KST)까지 약 7,070, 그 뒤 23시경까지 약 5,970**이다(14·15시 UTC 칸이 빠질 때까지)
- B12(T8-3): 식단 도구 2개를 durable로. B13(T10-2~5): 도구 하나만 마운트 + 게이트, 종류별 하루 횟수, 진행 중 예약, 주 밀림 안내
- **세 번째 배포(11-08 1시 20분경 KST)**: 원격 D1에 0004 적용 → B12(durable 식단 도구) + B13(한도 보호 보강) 배포(버전 `f802d3d7`, 커밋 `0be4b45`까지). 배포본 실제 1회 통과: 만들기 245초 `ok`, Traces에 대화 내용 없음, 알람 호출 최장 19초(15분 가설 아님), 예약 걸림·정산, 종류별 횟수 쌓임 ([기록](experiments/2026-11-08-b12-b13-deploy.md)). 확인용 원격 토큰 1개(사용자 `efab2710a0cdc7a0`)를 새로 발급했다
- 한도: Cloudflare GraphQL 최근 24시간 합계 8,457(11-08 01:39 KST). 한국 9시에 약 1,100, 23~24시에 약 6,000이 창에서 빠진다

**알게 된 문제**
- 배포본에서 식단표가 8분 넘게 안 나왔다(11-06 밤). 생성 1회가 5분 46초(출력 토큰이 평소의 약 2배)였고, 다시 추천이 4분 제한에 걸렸다. "다시 시도"는 Durable Object 재시작으로 결과가 사라졌다 (T8 절). 대기 상한은 B10a로 막았다. 추론 수준으로는 속도가 줄지 않았다(B11). 결과 유실은 B12
- 배포본에서 실제 사용자의 만들기가 `timeout`으로 끝났다(11-08 01:28~01:36 KST). Workers AI 생성 응답이 5분 동안 한 바이트도 오지 않아 Flue가 끊고(`streamIdleTimeoutMs` 기본 5분) 다시 물었는데, 우리 생성 호출 상한 8분이 첫 시작부터 재고 있어 다시 묻는 호출이 3분 만에 잘렸다. 약 960 Neuron(시간으로 셈)을 쓰고 결과가 없었다. AI Gateway 기록을 보면 사용자가 직접 만든 3번은 모두 실패했고, 그 프로필은 생성 출력이 약 15,000토큰(페르소나의 약 2배)·5~6분이라 매번 시간 상한에 걸렸다. 평가와 실제 확인은 페르소나 픽스처로만 해서 놓쳤다. B14(T8-6, T8-7)
- (가설 기각, 11-08) Durable Object 알람 15분 한도: 배포본 실제 1회 동안 알람은 10~20초 간격으로 짧게(최장 19초) 깨어날 뿐 응답 전체를 붙잡지 않았다. 11-06 재시작 원인은 모르지만 B12로 재시작돼도 결과가 남는다
- Workers AI 무료 한도가 00:00 UTC 초기화가 아니라 **최근 24시간 합계처럼** 동작했다 ([실험 기록](experiments/2026-11-07-t1-7-eval-personas.md)). 안전선은 B10a에서 24시간 합계로 바꿨다
- 보안 리뷰에서 나온 설계 과제(T10-2~5)는 B13 코드로 막았다(배포 전). 도구 하나만 마운트 + 게이트, 종류별 하루 횟수(5·5·15), 진행 중 예약, 주 밀림 안내

**다음 할 일 (순서대로)**
1. B14(T8-6, T8-7) 긴 생성 문제와 모델 비교 실험. 메뉴 많은 프로필에서 실제 사용자 성공률이 0이다. 하루 한도를 거의 다 쓰므로(약 2,500~4,000 Neuron) 한도가 풀린 날 시작 전 GraphQL로 확인하고 한다
2. "나중에" 절: 대화 기록 지우기, 지난 식단표 목록 등. 평가 세트 확장(T1-7)은 끝났다

**배포 순서 (테이블을 바꿀 때)**
- 원격 마이그레이션(`npx wrangler d1 migrations apply diet-coach --remote`)을 먼저 하고 바로 `npm run deploy`. 코드가 먼저 나가면 새 테이블이 없어 모든 메시지가 500이 된다
- 원격 명령이 권한 오류(7403)로 한 번 실패한 적이 있다(11-07). 다시 시도하면 됐다

**Neuron을 쓰는 작업 규칙 (사용자 결정, 2026-11-07)**
- 11-07에 Neuron을 쓰는 작업(B11 실측 등)은 **한국 시각 18시 이후**에 한다. 그 전에는 계획, 코드, 단위 테스트, 문서만 한다
- 시작 전에 Cloudflare GraphQL `aiInferenceAdaptiveGroups`로 최근 24시간 Neuron 합계를 확인하고, 작업 어림 Neuron과 더해 10,000 아래인지 본다. 18시 이후 쓸 수 있는 양은 약 6,900으로 추정한다

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
| B7. D1 저장소 | T6-1 | 단독. 연결(T6-2)은 사용자 ID가 생기는 T7-1 뒤로 미룬다 | 없음 |
| B8. 한도 보호 | T7-1, T7-2, T7-3 | 모두 요청 앞단의 보호 장치라 같은 미들웨어 자리에 들어간다 | 없음 (가짜 모드 바깥 턴 1회) |
| B9. 첫 배포 | T6-2, T7-4 | 바깥에 공개하는 일이라 따로 확인받고 진행한다 | 배포 후 평가 세트 1회 |
| B10. 로그 수집 | T8-1 | 다음 단계의 효과와 Durable Object 재시작 원인을 보려면 로그가 먼저 있어야 한다 | 없음 (배포 1회) |
| B10a. 대기 시간·한도 보완 | T8-4, T7-5 | 11-06에 겪은 문제(끝없는 대기, 한도 계산 어긋남)를 코드로 막는다. B11 실측 전에 끝내 두면 실측이 짧아진다 | 없음 (단위 테스트, 로컬 D1) |
| B10b. 리뷰 남은 버그 | T9-1 ~ T9-6 | B5·B6 리뷰에서 미룬 항목. 모두 순수 로직이나 화면 상태라 TDD로 끝난다 | 없음 |
| B10c. B12 사전 조사 | T8-5 | durable 도구로 바꿀지 판단할 자료. 문서 조사(끝남)와 가짜 생성기 실험 | 실험만 바깥 턴 실제 호출, 약 20~40 Neuron (B11과 함께) |
| 배포 전 리뷰 | T10-1 | 두 번째 배포 전 서브 에이전트 코드·보안 리뷰에서 나온 작은 수정 | 없음 |
| B11. 생성 속도 | T8-2 | 사용자가 겪은 문제(8분 넘게 대기)이고 Neuron도 줄어든다. 생성이 짧아지면 결과 유실도 줄어 B12보다 앞에 둔다 | 추론 수준 비교 몇 회. 약 1,000~1,500 Neuron |
| B12. 결과 유실 막기 | T8-3 | B10c 조사로 하는 쪽 제안. 식단 도구 2개를 durable로 바꾸고 생성기를 step으로 감싼다 | 가짜 생성기로 재시작 확인 + 실제 1회 |
| B13. 한도 보호 보강 | T10-2 ~ T10-5 | 배포 전 보안 리뷰의 설계 과제. 모두 요청 앞단·도구 마운트 자리라 함께 정한다. 사용자를 늘리기 전에 | 로컬 데모(바깥 턴만, 약 20 Neuron) + B12와 함께 배포본 실제 1회 |
| B14. 긴 생성과 모델 비교 | T8-6, T8-7 | 사용자 프로필(메뉴 많음)에서 생성이 5~6분 걸려 시간 상한에 걸린다. 재현용 픽스처를 먼저 만들고, 같은 조건에서 멈춤 감지 조정과 모델 교체를 함께 비교한다 | 픽스처로 gemma·gpt-oss-120b(low/medium)·mistral-small 각 2회. 약 2,500~4,000 Neuron |
| 평가 세트 확장 | T1-7 | 열린 질문 1은 2026-11-07에 정했다. 생성 방식이 바뀌는 B11 뒤에 한 번만 돌린다 | 페르소나 B·C·D 각 2회. 약 3,000~4,000 Neuron |

순서: B1 → … → B10c 조사 → T10-1 → 두 번째 배포 (끝남) → B11(+ T8-5 실험) → B12 코드 → B13 → B12·B13 함께 배포·실제 1회 → T1-7 → B14. T1-7은 하루 한도가 넉넉한 날, Cloudflare 대시보드에서 그날 사용량을 확인하고 돌린다.

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

- [x] **T1-7. 평가 세트 페르소나 2~4** (스펙 8.5) (2026-11-07)
  - B5부터 평가 세트는 회차마다 인터뷰 제출(메모 없음) → 메뉴 분류 → 식단표 만들기를 보낸다(`src/evals/support/prepare.ts`). 분류는 픽스처 값으로 바꿔 보내 점검 기준을 고정한다. 페르소나 2~4의 프로필과 메뉴 분류 픽스처를 더하면 된다
  - 페르소나별 2회 = 8회. 약 3,600 Neuron(회차마다 분류 gemma 약 180 포함), 약 45분. 하루에 한 번만 돌린다. 하루 한도의 3분의 1이 넘으므로 다른 실제 확인이 없는 날 돌린다
  - 잘못된 입력 케이스(8.5 표)는 인터뷰(T4-4) 뒤에 추가한다
  - 선행: T1-6, 태그 제한 값 확정(열린 질문 1, 2026-11-07 초안 값으로 확정. 근거는 스펙 2장), T8-2(생성 방식이 바뀐 뒤 한 번만 돌린다)
  - 진행(2026-11-07): 페르소나 B~D 픽스처(`core/__fixtures__/personas.ts`, 픽스처 검사 `personas.test.ts`), 평가 세트에 B~D와 전체 통과율(8회 중 7회) 판정 추가
  - 첫 실행(2026-11-07, 중단): A 2회 통과. B 1회차에서 Workers AI 한도 초과(4006)로 나머지 6회 건너뜀. 초기화 직후인데 우리 카운터 약 1,091에서 막혔다 ([실험 기록](experiments/2026-11-07-t1-7-eval-personas.md))
  - 완료(2026-11-07 23시 KST): 사용자 결정으로 B11보다 먼저 돌렸다. GraphQL로 최근 24시간 약 2,252 확인 후 B·C·D 각 2회, 6회 모두 처음에 통과(A 포함 8/8). 약 30분, 약 2,400 Neuron. Flue 기본 추론 수준 기준이라 B11에서 기본값을 바꾸면 다시 돌릴지 그때 정한다 ([실험 기록](experiments/2026-11-07-t1-7-eval-personas-bcd.md))

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
  - 바뀜(B6): llama-4-scout는 출력 256토큰에서 잘려 Flue 재요청이 반복됐다. 분류 모델을 gemma로 바꿨다(1회 약 95초, 약 180 Neuron). 배열 필드는 문자열 하나도 받는다 ([실험 기록](experiments/2026-11-06-b6-end-to-end.md))
  - 결정: `classify_menus` 도구는 `메뉴 분류 요청` 메시지에 불리고 결과를 `usePersistentState('menuClasses')`에 둔다. 식단표 도구는 페르소나 A 고정을 없애고 끝난 인터뷰(`profileFromInterview`, `userId: 'demo'`) + 확인된 분류로 만든다
  - 코드: `core/menu-classification.ts`, `core/menu-classifier.ts`(`runClassification`), `core/plan-request.ts`, `agents/menu-schema.ts`, `agents/flue-menu-classifier.ts`, `agents/demo-menu-classifier.ts`, `agents/classify-menus-tool.ts`
  - 결과: 실제 1회 한 번에 1:1, 분류 7초 약 65 Neuron(바깥 턴 14 별도). 국밥을 often으로 나눴고 백반·회덮밥은 이유가 성의 없음 ([실험 기록](experiments/2026-11-06-b5-menu-classify.md))
  - 평가 세트(`plan-generation.eval.ts`)는 B4부터 새 대화가 인터뷰 중이라 돌지 않았다. 인터뷰 제출 → 분류 → 만들기 순서로 고쳤다(B9 배포본과 T1-7에서 실제로 돌려 통과)

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
- [x] **T5-2. 프로필 확인 화면** (2026-11-06)
  - 프로필 표, 식단 기준, 항목별 수정, 저장 동의
  - 선행: T4-1
  - 결정: 인터뷰 단계가 끝나면 제출 전에 화면에서 보여 준다. "고치기"는 그 항목만 초안에서 비우고 그 단계를 다시 묻는다(`core/profile-edit.ts`의 `reopenSection`, 섹션: 목표·약·피할 음식·끼니 표·끼니별 메뉴·끼니별 조리 시간). 다시 묻는 단계는 이전 답을 미리 채우지 않는다
  - 결정: 저장 동의는 선택. 제출 메시지 `consent: true`면 도구가 서버 시각으로 `consentedAt`을 채운다(`InterviewResult.consentedAt?`, `profileFromInterview`가 씀). `validateProfile` 이슈(동의 제외)가 있으면 진행을 막는다
  - 코드: `ui/ProfileConfirmView.tsx`, `ui/interview-form-state.ts`(`reopen`, `progressFromResult`), `InterviewView.tsx`(자동 제출 대신 확인 화면)
- [x] **T5-3. 기간 선택 화면** (2026-11-06)
  - 1주일 선택, 정해진 일정(회식, 약속) 입력
  - 결정: 인터뷰 끝 → 기간 선택 → 메뉴 분류. 기간은 "다음 주 월~일" 한 가지. 일정은 요일 + 안 먹는 끼니가 아닌 끼니 + 메모(50자), 같은 칸은 한 번. 넣는 중인 일정은 localStorage(대화 ID별)
  - 결정: `메뉴 분류 요청:` + `{"events":[...]}`로 보내고 `classify_menus`가 `validateEvents`로 검증해 시작일(`nextMondayKst`, 이때 고정)과 함께 `usePersistentState('period')`에 둔다. `create_week_plan`은 이 기간을 쓴다. 식단표는 일정 칸을 "일정"으로 보여 주고 다시 추천은 없다(`plan-layout.ts`의 `DayRow.events`)
  - 코드: `core/period.ts`, `core/plan-request.ts`(`formatClassifyRequest`/`parseClassifyRequest`), `ui/PeriodView.tsx`, `PlanBoard.tsx`
- [x] **T5-4. 메뉴 분류 확인 화면** (2026-11-06)
  - 분류 표, 분류 바꾸기
  - 선행: T3-1
  - 결정: 인터뷰 끝 요약 화면의 "외식 메뉴 분류하기" 버튼 → 분류 중 → 분류 확인. 메뉴마다 라디오 3개(자주 먹어도 됨, 주 1회까지, 피하기), 바꾼 메뉴는 "바꿈"과 처음 분류를 보여 준다. 고르는 값은 localStorage(대화 ID별). "이 분류로 식단표 만들기"가 `식단표 만들기:` 메시지에 바꾼 분류를 싣는다
  - 결정: 바꾼 메뉴의 이유는 "직접 정한 분류"로 바꾼다(LLM 이유와 어긋나지 않게). 모든 메뉴를 피하기로 고르면 만들기를 막는다
  - 코드: `ui/menu-class-view-state.ts`(테스트 있음), `ui/MenuClassView.tsx`, `App.tsx`, `styles.css`. 761px 이상은 메뉴 | 분류 | 이유 3열, 그보다 좁으면 카드
  - 결과: 가짜 모드 두 가지로 Chrome에서 인터뷰 제출 → 분류 → 돈가스를 often으로 바꿈 → 식단표까지 확인(점검 요약의 주 1회 메뉴에서 돈가스가 빠짐). 새로고침 이어짐, 390px 폭 카드 확인
- [x] **T5-5. 첫 화면 분기** (2026-11-06)
  - 저장된 프로필이 있으면 "지난 프로필로 시작 / 바뀐 항목 고치기"
  - 결정(사용자): 서버 저장(T6)과 토큰(T7-1) 전이라 동의한 프로필은 이 브라우저 localStorage(`diet-coach:profile`)에 둔다. 동의하지 않고 진행하면 지운다. 다른 기기에서는 불러오지 못한다
  - 결정: 새 대화이고 저장한 프로필이 있으면 "지난 프로필로 시작"(바로 제출, 동의 유지) / "바뀐 항목 고치기"(확인 화면부터, 동의 기본 체크) / "인터뷰 처음부터" / "저장한 프로필 지우기"
  - 코드: `ui/saved-profile.ts`(모양·프로필 검증, 테스트), `ui/StartChoice.tsx`, `App.tsx`. `core/profile-edit.ts`의 `draftFromResult`
- [x] 완료 기준(T5 전체): 개발 서버에서 기획서 예시 사용자로 인터뷰부터 식단표까지 화면으로 끝까지 진행 (2026-11-06)
  - 결과: 첫 화면 분기 → 프로필 확인(조리 시간 고치기, 동의) → 기간 선택(수요일 저녁 팀 회식) → 분류(gemma 95초, 181 Neuron) → 식단표(168초, 236 Neuron, 처음에 통과, 13칸). 인터뷰 단계는 B4에서 확인해 이번에는 끝난 답을 넣고 시작했다 ([실험 기록](experiments/2026-11-06-b6-end-to-end.md))
  - 가짜 모드로: 동의 안 함(저장 지워짐), 지난 프로필로 시작, 새로고침 이어짐, 390px 폭 확인
  - 진행 중 추가: LLM 호출 시간 제한(`core/llm-timeout.ts`, `agents/prompt-call.ts`). 넘으면 도구가 `timeout`으로 답하고 화면이 다시 시도를 안내한다
- [x] **B5·B6 리뷰 반영** (2026-11-06, 서브 에이전트 리뷰 1~5번)
  - 1. 네 도구(`submit_interview`, `classify_menus`, `create_week_plan`, `edit_plan_cells`)는 실패해도 던지지 않고 `timeout`/`quota`/`error` 결과로 답하고 턴을 끝낸다. 던지면 바깥 모델이 같은 도구를 다시 불러 식단 생성이 한 번 더 돌 수 있었다(`core/tool-failure.ts`, `planFailure`). 바깥 턴 지시문에 "실패여도 다시 부르지 말 것"을 더했다
  - 2. 분류·인터뷰 도구가 에러 뒤 다시 불려 실행 중이면 화면은 실패가 아니라 진행 중으로 본다
  - 3. 식단표 만들기 실패 화면에 "다시 시도"(같은 대화, 같은 만들기 메시지)를 두었다. `plan-view-state`의 `retry`
  - 4. 대화별 진행 값(인터뷰 답, 일정, 고르던 분류)은 그 단계가 끝나거나 "처음부터 다시"로 새 대화로 넘어가면 지운다. "이 브라우저에 저장한 내 정보 지우기"는 대화 ID를 뺀 `diet-coach:*`를 지운다(`ui/browser-store.ts`). 서버 대화 기록은 스펙 5장 열린 질문
  - 5. 저장 동의는 "바뀐 항목 고치기" 직후에만 미리 체크한다(`ui/start-choice-state.ts`)
  - 확인: 테스트 429개. 가짜 모드 Chrome에서 단계마다 키가 지워지는지, 동의 기본값, 지우기, 새 대화로 넘어갈 때 지우기를 확인했다. 실패 화면의 다시 시도는 단위 테스트로만 확인

### T6. D1 저장소 (9장 9단계)

- [x] **T6-1. `D1Storage`** (스펙 5장) (2026-11-06)
  - 완료 기준: `storageContract('D1Storage', ...)` 계약 테스트 통과
  - 결정: `@cloudflare/vitest-pool-workers`(0.23.0)는 vitest 4만 지원해 쓰지 않는다. wrangler `getPlatformProxy`로 Node 테스트 안에서 로컬 D1을 띄운다(테스트 전용 설정 `wrangler.storage-test.jsonc`, `persist: false`, 원격 호출 없음). 계약 테스트의 `create`는 `Promise<Storage>`도 받는다
  - 결정: 테이블은 키 열 + JSON 본문(`migrations/0001_init.sql`). 가장 나중 식단표는 `seq` 최대(저장 순서). 버전 증가는 `INSERT … ON CONFLICT … RETURNING` 한 문장. `deleteUser`는 `batch`(트랜잭션). 같은 `planId`도 새 행으로 쌓는다(메모리 구현과 같음)
  - 결정: D1 타입은 `D1Like`(쓰는 메서드만)로 직접 둔다. workers-types를 tsconfig 전역에 넣지 않는다
  - 코드: `storage/d1-storage.ts`, `storage/d1-storage.test.ts`
- [x] **T6-2. D1 연결** (2026-11-06, B9)
  - 결정: 동의한 사용자만 D1에 남긴다. 인터뷰 제출이 동의면 프로필 저장, 미동의면 `deleteUser`. 식단표는 만들기·칸 수정 성공 때 동의 프로필이 있으면 새 행으로 저장(같은 `planId`도 새 행). 저장 실패는 경고만 남기고 도구 결과는 그대로(`storage/persist.ts`, `persistQuietly`)
  - 결정: 사용자 ID는 에이전트 `props.id`(대화 ID `<userId>-…`)에서 얻는다(`core/profile-store.ts`). 저장소는 `agents/storage-binding.ts`(`cloudflare:workers`)
  - 결정: 화면은 `GET/DELETE /api/profile`로 불러오고 지운다(`server/profile-routes.ts`, `ui/saved-profile.ts`). B8까지의 localStorage `diet-coach:profile`은 처음 열 때 지운다. 불러오기 전에는 인터뷰 첫 화면 대신 "불러오는 중"
  - 결정(사용자): 대화 기록(Durable Object)은 첫 배포에서 저장 동의 설명에 "대화 기록으로 서버에 남아요"라고 안내만 한다. 지우기는 "나중에"
  - 확인: 가짜 모드 개발 서버에서 동의 제출 → D1 프로필, 만들기 → D1 식단표(실제 사용자 ID), 새 대화에 "다시 오셨네요", "저장한 내 정보 지우기" → 서버 프로필·식단표 0, 토큰은 남음
  - `env.DB`가 `D1Like`에 맞는지는 배포 뒤 동작으로 확인했다(프로필 조회, 카운터)

### T7. 한도 보호 (9장 10단계, 배포 전 필수)

- [x] **T7-1. 사용자 토큰 확인** (스펙 11.4-1) (2026-11-06, B8)
  - 완료 기준: 토큰이 없거나 틀리면 401. 토큰은 해시로만 저장. 대화 ID는 토큰에서 정함
  - 결정: 토큰은 스크립트로 발급한다(`npm run issue-token -- --local|--remote [--origin URL]`, 256비트, D1 `users`에 SHA-256 해시만). 링크는 `/?t=<토큰>`이고, 화면이 토큰을 `diet-coach:token`에 두고 주소창에서 지운다. "내 정보 지우기"는 토큰을 남긴다
  - 결정: 대화 ID는 `<userId>-<UUID>`. 미들웨어는 접두어가 다르면 403. 화면은 `GET /api/me`로 사용자 ID를 받고, 저장한 대화 ID가 다른 사용자 것이거나 토큰 전 UUID면 새 대화로 시작한다
  - 결정: 개발 서버에도 같은 보호를 건다. 평가 세트는 `DIET_COACH_TOKEN`으로 토큰을 보낸다
  - 코드: `core/guard.ts`, `server/guard.ts`, `storage/guard-store.ts`, `migrations/0002_guard.sql`, `ui/AccessGate.tsx`, `ui/auth-token.ts`, `ui/conversation-id.ts`, `scripts/issue-token.mjs`
- [x] **T7-2. 사용자별 하루 호출 제한** (스펙 11.4-2) (2026-11-06, B8)
  - 완료 기준: 제한을 넘으면 429와 한도 안내
  - 결정: LLM 호출 수가 아니라 메시지 POST 수로 하루 30회. 미들웨어는 요청 앞단이라 호출 수를 미리 모른다. 읽기(GET)와 abort는 세지 않는다. SDK는 GET 스트림이 429를 받으면 끝없이 다시 시도하고, send는 다시 시도하지 않기 때문이다
  - 결정: 화면은 보내기 실패가 한도·링크 문제면 각 화면의 실패 문구 자리(인터뷰 확인, 기간 선택, 만들기 실패, 칸 수정 알림)에 그 안내를 띄운다(`ui/send-error.ts`)
- [x] **T7-3. 전체 하루 Neuron 안전선** (스펙 11.4-3) (2026-11-06, B8)
  - 완료 기준: 8,000 Neuron에 닿으면 새 요청은 막고 진행 중인 요청은 끝까지 처리
  - 선행: T1-2
  - 결정: 새 메시지 POST를 모두 막는다(분류, 칸 수정 포함). 막힌 메시지는 사용자 횟수를 쓰지 않는다. 값과 범위는 무료 티어 전제라 [plan-upgrade.md](plan-upgrade.md)에 따로 적었다(사용자 요청)
  - 결정: 바깥 턴은 `useResponseFinish`, 도구 안은 `agents/metered-harness.ts`가 D1 `usage_daily`의 `all`에 더한다(`agents/usage-meter.ts`, `cloudflare:workers`의 `env.DB`). 사용량을 모르는 실패·시간 초과 호출은 걸린 초 × 2 Neuron(리뷰 6번 처리)
- [x] **B8 확인** (2026-11-06): 테스트 480개. 개발 서버(가짜 모드)에서 토큰 없음·틀림 401, 남의 대화 403, 링크로 열면 주소창 정리와 접두어 대화 ID, 바깥 턴 1회가 `all`에 약 10.4 Neuron으로 기록, 횟수 30에서 화면에 사용자 한도 안내, Neuron 8,000에서 안전선 안내(막힌 메시지는 횟수 0 그대로). 실제 모델 호출은 바깥 턴 1회
- [x] **T7-4. 첫 배포** (2026-11-06, B9)
  - 선행: T7-1 ~ T7-3, T6-1, T6-2
  - 원격 D1 `diet-coach`(APAC) 생성, 마이그레이션 0001·0002 적용, `npm run deploy` → https://diet-coach.jjangyeesoo1.workers.dev
  - 확인: 토큰 없음·틀림 401, 남의 대화 403, `/api/me`·`/api/profile` 200. 배포 직후 몇 초는 404·에러 1042가 났다가 정상으로 돌아왔다(전파)
  - 실제 모델: 배포본 평가 세트 1회 통과(식단 237초, 다시 추천 1회, 403 Neuron, D1 카운터 전체 약 508) ([실험 기록](experiments/2026-11-06-b9-first-deploy.md))
  - 사용자 토큰은 `npm run issue-token -- --remote --origin https://diet-coach.jjangyeesoo1.workers.dev`로 발급한다
- [x] **T7-5. 전체 안전선을 최근 24시간 합계로** (B10a, Neuron 없음) (2026-11-07)
  - Workers AI 한도가 최근 24시간 합계처럼 동작했다(2026-11-07, [실험 기록](experiments/2026-11-07-t1-7-eval-personas.md)). 지금 안전선은 UTC 날짜별 합계라 전날 늦게 쓴 양을 보지 못한다
  - Neuron을 시간 단위로 쌓고(새 마이그레이션) 최근 24시간을 합산해 8,000과 비교한다. 사용자 하루 메시지 수(30)는 날짜 기준 그대로 둔다. 추정이 틀려도 더 보수적인 쪽이라 손해가 없다
  - 확인: `guard-store` 계약 테스트(메모리·로컬 D1), 미들웨어 테스트. `plan-upgrade.md` 카운터 초기화 항목과 스펙 11.4를 고친다
  - 결정: `migrations/0003_usage_hourly.sql`에 `usage_hourly(hour, neurons)`, `hour`는 UTC `YYYY-MM-DDTHH`. 합산 창은 24시간 전 시각이 속한 칸부터 지금 칸까지 25칸(24~25시간, 더 막는 쪽). `GuardStore`는 `neuronsSince(fromHour)`/`addNeurons(hour, n)`, 순수 함수는 `core/guard.ts`의 `utcHour`, `neuronWindowStart`
  - 결정: 마이그레이션이 기존 `usage_daily`의 `all` 값을 그날 `T00` 칸으로 옮긴다(배포 직후 0에서 시작하지 않게). `usage_daily.neurons`는 더 쓰지 않는다
  - 결정: 안전선·한도 초과 문구를 "오늘 사용할 수 있는 양을 다 썼어요. 몇 시간 뒤에 다시 해 주세요."로 바꿨다(24시간 창이라 시각을 말하지 않음). 사용자 횟수 문구는 날짜 기준이라 그대로
  - 결과: 테스트 527개, 로컬 D1에 0003 적용(11-07 `all` 1,091 → `2026-11-07T00` 칸). 원격 D1 적용과 배포는 11-07 12시경 끝(옮긴 칸 방식은 T10-1 C로 고친 뒤 적용)

### T8. 배포본 식단 생성 문제 (2026-11-06 사용자 보고)

배포본에서 식단표가 8분이 지나도 나오지 않았다. AI Gateway 로그로 확인한 원인(한국 시각 11-06 23:06~23:22):
- 1차: 13칸 생성이 5분 46초(출력 14,832토큰, 평소의 약 2배). 위반 4칸 다시 추천이 4분 제한에 걸려 약 10분 뒤 시간 초과로 끝났다. 호출별 제한(생성 8분, 다시 추천 4분)이라 도구 전체 시간에는 상한이 없다
- 2차("다시 시도"): 생성은 4분 34초에 끝났지만 그 직전 Durable Object가 재시작돼 도구가 `interrupted`로 끝나고 결과가 사라졌다. 재시작 원인은 로그 수집을 켜지 않아 모른다

- [x] **T8-1. 배포본 로그 수집** (B10, 2026-11-07)
  - `wrangler.jsonc`에 `observability`(logs 전부, invocation logs, traces)를 켜고 다시 배포했다. 무료 한도는 `plan-upgrade.md`
  - 확인: 배포 뒤 요청(ping, 401, `/api/me`, 대화 GET)이 Workers Logs에 남았다(요청 로그 18건, Durable Object·D1 스팬 90건). 요청 헤더는 이름만 남고 `Bearer`나 토큰 값은 없었다. 요청 로그에는 접속 지역(도시, 통신사)이 남는다
  - 함께 확인(2026-11-07): Workers AI 사용량은 Cloudflare GraphQL `aiInferenceAdaptiveGroups`(시간대별 `totalNeurons`)로 볼 수 있다. 한도가 최근 24시간 합계로 세는 것처럼 동작했다([실험 기록](experiments/2026-11-07-t1-7-eval-personas.md)). 실측 묶음(B11, T1-7)은 시작 전에 이 값을 확인한다
  - 확인(11-08 배포본 실제 1회): 도구 안 Flue `log.info`는 Workers Logs에 나오지 않는다(이벤트 종류가 span, request-logs, cf-worker-event뿐). 도구 단위는 span과 AI Gateway 로그로 본다
- [x] **T8-2. 식단 생성 속도와 전체 대기 시간** (B11) (2026-11-08)
  - 식단 생성의 추론 수준(`thinkingLevel`)을 낮췄을 때 출력 토큰·시간·`checkPlan` 통과율 비교. 기다리는 화면의 "약 3분" 안내를 실측에 맞춘다. 전체 시간 상한과 추론 수준 배선은 T8-4에서 먼저 한다
  - 선행: T8-1, T8-4
  - 결과: low 8회를 같은 날 medium 8회(T1-7)와 비교. 둘 다 8/8 통과, 출력 토큰 중앙값 7,878 → 7,331(-7%), 도구 시간 중앙값 178 → 180초 ([실험 기록](experiments/2026-11-07-b11-thinking-level.md))
  - 결정: 기본 추론 수준은 medium 그대로(기준: 7/8 통과 + 약 25% 이상 감소). `PLAN_THINKING`은 시험용으로 남긴다. 생성은 2~6분(중앙값 약 3분)이라 기다리는 화면 "4분쯤"과 시간 예산(만들기 10분, 생성 8분)도 그대로
  - 배포본 확인(Traces 내용, `log.info`, 알람 15분)은 코드가 바뀌지 않아 배포하지 않고 B12 배포 뒤로 옮겼다
- [x] **T8-3. 긴 LLM 호출 결과 유실 막기** (B12) (2026-11-08)
  - Flue durable 도구(`durable: true`, `step.do`)로 생성 호출을 감싸 Durable Object가 재시작돼도 다시 부르지 않고 이어 가게 한다. T8-1 로그로 재시작 빈도를 본 뒤 할지 정한다
  - 범위 초안(B10c): `create_week_plan`·`edit_plan_cells`에 `durable: true`, 생성기를 감싸 호출마다 `step.do('llm:N')`, `step.do('start')`로 planId·시각·예산 시작 고정, D1 저장도 step, 에이전트 `durability`를 줄임(예: 3회, 20분). 분류·인터뷰 도구는 짧아 뺀다 ([조사 기록](experiments/2026-11-07-b10c-durable-tools.md))
  - 선행: T8-1, T8-2, T8-5 남은 실험 (모두 끝남)
  - 실험으로 확정(2026-11-07 밤, B10c 기록 "결과"): durable이면 끝난 `llm:N` step은 다시 부르지 않고 끊긴 step만 다시 돈다. 도구 결과는 복구 커밋으로 남는다. 시작 시각을 step 밖에서 재면 복구 뒤 처음부터 다시 잰다(실험 `stats.seconds` 60) → `start` step에 planId·createdAt·startedAt을 넣는다. 실험 코드 diff는 버렸고 위 범위 초안대로 다시 짠다
  - 배포 뒤 실제 1회 때 함께 볼 것: "현재 상태 > 다음 할 일 1"
  - 진행(2026-11-08 0시경): 코드·테스트·로컬 확인 끝. 남은 것은 배포와 배포본 실제 1회
    - 결정: `core/stepped-generator.ts`의 `steppedGenerator(gen, step)`가 호출마다 `step.do('llm:N')`(만들기·다시 추천 공통 순번). core는 Flue를 import하지 않아 `StepRunner` 최소 인터페이스를 둔다. 안쪽이 던지면 기록하지 않고 같은 에러가 올라온다(Flue `createToolStep` 소스 확인)
    - 결정: `TimeBudget.startedAt`(선택). 만들기는 `start` step에 planId·createdAt·startedAt·weekStart(자정 경계 복구 대비), 칸 수정은 startedAt만. `toolStats`·`planFailure`도 이 시각 기준
    - 결정: D1 저장은 `persist` step, `saveClasses`·`savePlan`은 step 밖(도구 결과와 함께 커밋). 분류·인터뷰 도구는 그대로
    - 결정: `DietCoach.durability = SUBMISSION_DURABILITY`(3회, 20분, `core/llm-timeout.ts`). `plan-upgrade.md`에 적음
    - 배포(11-08 1시 20분경 KST, 버전 `f802d3d7`, B13과 함께)와 배포본 실제 1회 끝: 만들기 `ok`, 알람 호출 최장 19초 ([기록](experiments/2026-11-08-b12-b13-deploy.md))
    - 확인: 테스트 587개(새 6개: steppedGenerator 4, 예산 startedAt 2), 타입 검사, 빌드. 로컬 데모 생성기로 만들기·칸 수정 도중 서버 강제 종료 → `start`는 기록값, `llm:1`만 다시 돌아 `ok`, `stats.seconds` 124·127초 ([기록](experiments/2026-11-08-b12-durable-plan-tools.md))

- [x] **T8-4. 도구 전체 시간 상한과 추론 수준 배선** (B10a, Neuron 없음) (2026-11-07)
  - 지금은 호출마다 제한(생성 8분, 다시 추천 4분)만 있어 도구 전체로는 20분 가까이 걸릴 수 있다. 만들기·칸 수정 도구에 전체 예산을 두고, 다음 호출은 남은 시간 안에서만 부른다. 남은 시간이 모자라면 다시 추천을 멈추고 지금까지의 결과로 끝낸다(위반이면 `violations`, 시간이면 `timeout`)
  - 식단 생성·칸 수정 시간 초과를 "만들지 못했어요"(일반 에러) 대신 `timeout` 결과로 안내한다("나중에"에 있던 항목)
  - 식단 생성의 `thinkingLevel`을 설정으로 바꿀 수 있게 배선만 한다(기본값은 그대로). 값 비교는 T8-2
  - 확인: `FakePlanGenerator`와 가짜 시계로 루프 테스트
  - 결정: 예산은 `core/llm-timeout.ts`의 `PLAN_TOOL_BUDGETS`(만들기 10분, 칸 수정 5분)와 `MIN_REGENERATE_MS`(60초). B11 실측 뒤 다시 맞춘다. 루프(`createPlan`/`editPlanCells`)는 입력의 `budget: { totalMs, now }`로 시계를 받고, 없으면 예전처럼 제한 없이 돈다
  - 결정: 포트에 `CallOptions { limitMs }`를 더했다. 루프가 남은 시간을 넘기고 Flue 구현은 호출별 상한과 짧은 쪽(`callLimit`)을 쓴다. 칸 수정의 첫 호출(사용자 요청)은 남은 시간과 관계없이 부른다
  - 결정: 남은 시간이 60초 미만이면 다시 추천을 부르지 않고 지금 결과로 끝낸다(위반이면 `violations`). 이때 `stoppedForTime: true`가 루프 결과와 도구 `stats`에 남는다. 화면 변경 없음
  - 확인: 시간 초과 안내는 이미 되어 있었다. `PlanLoopError(cause: LlmTimeoutError)` → `failureKind` → `status: 'timeout'`, 화면은 `LLM_TIMEOUT_MESSAGE`(B5·B6 리뷰 1번). 루프 테스트로 못박았다
  - 결정: 식단 생성·다시 추천의 추론 수준은 `.dev.vars`의 `PLAN_THINKING`(`low|medium|high`, `models.ts`의 `planThinking`). 없으면 Flue 기본값으로 지금과 같다
- [x] **T8-5. B12 사전 조사: durable 도구** (B10c, Neuron 없음) (2026-11-07)
  - Flue `durable: true`·`step.do` 문서와 설치된 소스를 보고, 생성 호출을 감쌀 때 바뀌는 것(재시작 뒤 다시 부르지 않음, 도구 결과·상태 저장 시점, 시간 제한과의 관계)을 정리한다. 가짜 생성기로 동작만 확인한다
  - 결과로 B12를 할지, 한다면 범위를 정한다
  - 진행(2026-11-07): 문서·소스 조사 끝([조사 기록](experiments/2026-11-07-b10c-durable-tools.md)). 끝난 `step.do`는 복구 때 다시 부르지 않고, step 밖 코드는 다시 돈다. 보통 도구는 끊기면 "결과 모름" 에러로 끝나 모델이 다시 부를 위험이 있다. 제안: B12를 한다
  - 실험(23:45~23:56 KST, 약 30~40 Neuron): 보통 도구는 끊기면 `interrupted` 에러로 끝나고 바깥 모델은 다시 부르지 않았다(지시문 인용, 1회 관찰). durable은 끊긴 step만 다시 돌아 `ok`로 끝났다. 결정: B12를 한다. 지시문은 그대로 둔다
  - 알람 15분 가설(3)은 배포본 로그가 필요해 B12 배포 뒤로 옮겼다

- [ ] **T8-6. 메뉴 많은 프로필에서 생성이 5~6분 걸리는 문제** (B14, 사용자 결정 2026-11-08: 실험 작업으로)
  - 겪은 일(배포본, 11-07 16:28~16:36 UTC = 11-08 01:28~01:36 KST, 기존 사용자 링크): 식단 생성 호출이 16:28:17에 시작해 **300.3초 동안 응답이 오지 않았다**(AI Gateway: 상태 200, 출력 토큰 1). Flue `cloudflareBindingProvider`의 `streamIdleTimeoutMs`(기본 5분, `node_modules/@flue/runtime/docs/reference/provider-api.md`)가 끊고 같은 요청을 다시 보냈다(16:33:18). 우리 생성 호출 상한 8분(`LLM_TIME_LIMITS.generatePlan`)은 Flue의 재요청을 포함해 첫 시작부터 재므로 다시 묻는 호출은 약 3분 만에 우리가 끊었다(16:36:16, 499). 도구 결과 `timeout`, 화면 "응답이 너무 오래 걸려 멈췄어요". 사용량은 시간으로 세어 약 960 Neuron
  - 사용자가 직접 만든 3번 비교(AI Gateway, 생성 호출만)

    | 언제(KST) | 입력 | 출력 | 시간 | 결과 |
    | --- | --- | --- | --- | --- |
    | 11-06 23:12 | 2,243 | 14,832 | 347초 | 생성은 됐지만 다시 추천이 4분 상한에 걸려 실패 |
    | 11-06 23:22 다시 시도 | 2,243 | 14,896 | 275초 | 생성은 됐지만 Durable Object 재시작으로 유실 |
    | 11-08 01:28 | – | – | 300초 무응답 | 위 `timeout` |
    | (비교) 페르소나 A~D, 11-06~11-08 | 약 2,000~2,200 | 5,700~10,700 | 113~264초 | 모두 끝남 |

    분류 입력도 사용자 6,270~7,792토큰, 페르소나 1,100~2,800토큰. 외식 메뉴가 많은 프로필이다
  - 원인(추정): 출력(추론 포함)이 페르소나의 약 2배라 생성이 5~6분 걸려, 시간 상한(Flue 무응답 5분, 생성 8분, 다시 추천 4분, 도구 10분) 중 하나에 매번 걸린다. 11-08의 300초 무응답이 Workers AI 일시 멈춤인지, 길게 추론하며 아무것도 보내지 않은 것인지는 기록만으로 가릴 수 없다. B12(durable)는 Durable Object 재시작 대비라 이 경우를 막지 못한다
  - 놓친 이유: 평가 세트와 실제 확인을 모두 페르소나 픽스처로만 했다. 실제 사용 조건(메뉴 많음)을 시험하지 않았다
  - 진행(2026-11-08): 할 일 1의 픽스처는 페르소나 E로 만들었다(감량 + 혈당, 유제품·견과 피하기, 평일 점심 20개·저녁 15개 외식, `core/__fixtures__/personas.ts`, 평가 세트에도 넣음). 재현 측정(gemma)은 아직
  - 할 일 1(먼저): 사용자 프로필과 비슷한 "메뉴 많은" 픽스처를 만든다(외식 끼니마다 메뉴 여러 개, 분류 입력 약 6,000~8,000토큰 수준). 사용자 실제 프로필은 쓰지 않는다(건강 정보). 로컬에서 재현하고 첫 바이트까지 시간, 출력 토큰, 전체 시간을 잰다
  - 할 일 2: 재현 결과로 고른다. 후보: `streamIdleTimeoutMs` 줄이기(정상 생성의 첫 바이트 시간 확인 뒤), 프롬프트에 넣는 메뉴 수 줄이기, 생성을 평일·주말 2번으로 나누기(스펙 11.5 방식 B 결정을 다시 봄), 모델 교체(T8-7)
  - 할 일 3: 화면에서 "모델이 응답하지 않아 멈췄어요"처럼 원인을 구분해 안내
  - 평가 세트(스펙 8.5)에 메뉴 많은 페르소나를 더한다
  - 근거: [배포 기록 "추가 확인"](experiments/2026-11-08-b12-b13-deploy.md), AI Gateway `default` 로그
- [ ] **T8-7. 식단 생성 모델 비교 실험** (B14, 실제 모델, 사용자 결정 2026-11-08: 실험 작업으로)
  - 질문: Neuron을 조금 더 쓰더라도 더 믿을 만한 모델로 바꾸면 메뉴 많은 프로필에서 시간 안에, 규칙을 지키는 식단표가 나오나
  - 후보(2026-11-08 Workers AI 모델 목록 API로 조회, 함수 호출 지원, 1,000 Neuron = $0.011로 환산)

    | 모델 | 유형 | Neuron/100만 토큰 (입력/출력) | 1회 생성 어림 | 메모 |
    | --- | --- | --- | --- | --- |
    | `@cf/google/gemma-4-26b-a4b-it` (지금) | 추론형 | 9,091 / 27,273 | 240(출력 8k)~430(15k) | 추론 수준에 거의 반응하지 않음(B11) |
    | `@cf/openai/gpt-oss-120b` | 추론형, 큰 모델 | 31,818 / 68,182 | 약 620(8k)~1,090(15k) | 품질 기대 가장 높음. 추론 수준 low로 시간을 줄일 수 있는지가 핵심 |
    | `@cf/mistralai/mistral-small-3.1-24b-instruct` | 추론 안 함 | 31,909 / 50,455 | 약 220(출력 3k) | 가장 빠를 것으로 예상. 규칙 위반과 다시 추천이 늘 수 있음 |
    | `@cf/openai/gpt-oss-20b` | 추론형 | 18,182 / 27,273 | 약 260(8k) | 여유 있으면 |

    뺀 것: qwen3.8-27b(출력 단가 290,909, 1회 2,000 이상), llama-3.3-70b(컨텍스트 24k, 출력 단가 204,818), GLM-5.x·Kimi·DeepSeek V4·nemotron·qwen3-30b(대부분 2026-11-20 지원 종료 예정, 일부는 무료로 못 씀, 스펙 11.1)
  - 방법(초안): T8-6의 메뉴 많은 픽스처로 gemma, gpt-oss-120b(low/medium), mistral-small을 각 2회. 생성 시간, 출력 토큰, 스키마 통과, `checkPlan` 통과율(다시 추천 포함), Neuron, 한국어 이유 문장·태그 품질(사람 확인)을 본다. 약 2,500~4,000 Neuron
  - 먼저 확인: 각 모델의 기본 출력 상한(Flue가 `max_completion_tokens`를 보내지 않음, llama-4-scout는 256토큰에서 잘림), 무료 티어에서 호출되는지, 추론 수준(`reasoning_effort`)이 먹는지. 짧은 호출 1번씩으로 본다
  - 바꾸게 되면: `models.ts`의 `MODEL_CANDIDATES`·`NEURON_PRICES`, 스펙 11.1·11.5, 사용량 관련 값(종류별 하루 횟수, 예약량, 안전선 여유)과 `plan-upgrade.md`를 함께 맞춘다
  - 선행: T8-6 할 일 1(픽스처)
  - 진행(2026-11-08 02시경 KST, 남은 한도 약 1,540이라 gpt-oss-120b low 1회만, 사용자 결정): **식단표까지 못 감** ([기록](experiments/2026-11-08-b14-gpt-oss-low.md)). 약 120 Neuron
    - 결정·구현: gpt-oss-120b는 Workers AI 기본 출력 상한 256토큰이라 `src/agents/output-caps.ts`(공급자 `stream`을 감싸 모델별 `maxTokens`)와 `src/agents/provider.ts`(`setProvider`)를 더했다. 식단 생성 모델은 `.dev.vars`의 `PLAN_MODEL`(`models.ts` `planModel`). 기본 동작은 그대로
    - 막힌 것 1: 도구 안 `harness.prompt`가 에이전트 시스템 지시("create_week_plan 도구를 한 번 부르세요")와 도구 목록을 물려받아 gpt-oss가 `finish` 대신 `create_week_plan`을 불렀다(Flue가 재귀 차단). gemma도 같은 지시를 받고 있어 잠재 위험
    - 막힌 것 2: 두 번째 턴부터 Workers AI gpt-oss가 Flue 메시지 형식(사용자 `content` 배열, 도구 부른 assistant `content: null`)을 400(`5006 Bad input`)으로 거절
    - 다음(새 계획 필요): 공급자 감싸기에서 gpt-oss 요청의 `onPayload`로 `content`를 문자열로 맞추기, 도구 안 프롬프트가 `finish`만 부르게 하기. mistral-small도 같은 형식 문제가 있는지 짧은 2턴 호출로 먼저 확인
  - 진행 2차(2026-11-08, 사용자가 정한 순서 ①→②→③): ([기록](experiments/2026-11-08-b14-payload-check.md)) 약 22 Neuron
    - ① 직접 2턴 호출: mistral-small은 Flue 모양 그대로 200(보정 불필요, 출력 상한 256만 넣음). gpt-oss는 Flue 모양 400 재현, 문자열 content로 맞추면 200이고 `finish`를 제대로 부름
    - ② 결정: 식단 생성·다시 추천·메뉴 분류 프롬프트 첫 줄 `FINISH_ONLY`("이 요청에서는 다른 도구를 부르지 말고 결과를 finish 도구로만 보내세요."), 바깥 지시는 접두어 조건을 되살림(`agents/agent-instructions.ts`). `harness.prompt`에 지시·도구를 바꾸는 옵션이 없어 문구로 막는다
    - ③ 결정: `output-caps.ts`가 후보 모델 전체에 상한 또는 `null`을 명시(타입으로 강제), gpt-oss만 `PAYLOAD_FIXES`(`onPayload`로 문자열 content). 자기 키만 보고 숫자만 쓴다(커밋 뒤 자동 보안 리뷰 2건 반영)
  - 진행 3차(2026-11-08 08:33 KST, 사용자 결정: gpt-oss low만 지금): **페르소나 E에서 72초, 출력 3,585토큰, 306 Neuron, 첫 생성에 `checkPlan` 통과**(재요청·다시 추천 없음) ([기록](experiments/2026-11-08-b14-gpt-oss-low-run.md)). 약 376 Neuron. 바깥 턴(gemma)은 바뀐 접두어 조건 지시로 도구를 정상 호출. 품질 확인할 점: 흰쌀·흰빵 칸에 `refined_carb_main` 태그 누락(혈당 제한을 태그 누락으로 통과했을 수 있음), 외식 칸 주문 팁 빈 곳 많음. 1회라 흔들림은 모름
    - 남은 것: 페르소나 E로 gemma·gpt-oss-120b(low)·mistral-small 실제 비교(한도가 풀린 날, 약 2,500~4,000 Neuron). mistral은 `PLAN_MODEL=mistral`로 바로 시험할 수 있다(후보와 상한 등록됨). 바깥 턴 지시가 바뀌었으니 바깥 턴이 도구를 제대로 부르는지도 함께 본다

### T9. B5·B6 리뷰 남은 버그 (B10b, Neuron 없음)

- [x] **T9-1. 깨진 만들기 메시지는 `bad_request`** (리뷰 7번) (2026-11-07): `식단표 만들기:` 뒤 JSON이 깨지면 지금은 바꾼 분류를 버리고 저장된 분류로 만든다. 사용자가 고른 분류가 조용히 무시되지 않게 `bad_request`로 답한다
  - 결정: `core/plan-request.ts`의 `resolvePlanClasses`. 형식 밖 메시지("식단표 만들어 줘")는 지금처럼 저장된 분류로 만든다. `PlanToolOutput`에 `bad_request`, 화면은 그 안내로 실패 표시하고 다시 시도는 없다(같은 깨진 메시지라서)
- [x] **T9-2. 바꾼 분류는 성공한 뒤 저장** (리뷰 8번) (2026-11-07): 지금은 만들기 전에 저장해서 실패해도 바뀐 채 남는다
  - `create_week_plan`이 `result.ok`일 때 `savePlan`과 함께 `saveClasses`. 도구 코드 이동이라 타입 검사로 확인
- [x] **T9-3. 분류 스키마가 받아 줄 모양** (리뷰 10번) (2026-11-07): `reason: null`, 메뉴 이름 앞뒤 공백. 지금은 검증 실패 → Flue 재요청(Neuron)으로 이어진다
  - `menu`는 `v.trim()` 뒤 1:1 검사, `reason`은 nullish → 빈 문자열. Flue의 JSON 스키마 변환(`errorMode: 'ignore'`)에서 문제없음을 확인
- [x] **T9-4. 시작일 고정 시점** (리뷰 11번) (2026-11-07): 시작일을 분류할 때 정해서, 일요일 밤 분류 → 월요일 만들기면 이미 시작된 주가 된다. 만들 때 다시 계산할지, 지나간 날을 막을지 정한다
  - 결정: 만들 때 다시 본다. `core/period.ts`의 `planWeekStart(saved, now)`: 저장한 시작일이 오늘(KST) 뒤면 그대로, 오늘이거나 지났으면 다음 월요일. 일정은 요일 기준이라 의미가 같다. 칸 수정은 이미 만든 식단표 날짜 그대로
- [x] **T9-5. 분류 도구 분기 테스트** (리뷰 12번) (2026-11-07): `bad_request`, `no_interview`, period 저장 시점
  - 판단을 `core/classify-runner.ts`의 `handleClassifyRequest`로 옮기고(결과 `{ output, save?, failure? }`) 가짜 분류기로 테스트. 도구는 `save`가 있을 때만 분류와 기간을 저장한다(분류 실패면 기간도 저장 안 함)
- [x] **T9-6. 일정을 다 넣으면 입력 폼이 사라지는 문제** (리뷰 13번) (2026-11-07): 화면 상태 함수로 재현하고 고친다
  - `ui/period-view-state.ts`의 `periodFormState`. 넣을 끼니가 없으면 폼 자리에 "모든 끼니에 일정을 넣었어요. 일정을 빼면…" 안내. `validateEvents`에 `no_meals_left`(모든 끼니가 일정)를 더해 화면은 "다음"을 막고, 서버(`classify_menus`)는 `bad_request`
  - 확인: 단위 테스트만. 화면까지 가려면 인터뷰 제출(바깥 턴 실제 호출)이 필요해 Chrome 확인은 생략했다

### T10. 배포 전 리뷰 (2026-11-07, 서브 에이전트 코드 리뷰·보안 리뷰)

T10-1은 두 번째 배포에 들어갔다. T10-2~5는 묶음 B13.

- [x] **T10-1. 배포 전 작은 수정 A~F** (2026-11-07, Neuron 없음)
  - A. 트레이스에 대화 내용을 남기지 않는다: `app.ts`에 `instrument(createCloudflareTracing({ content: false }))`. 인터뷰 답·복용약·프롬프트·식단표가 Workers Traces에 남고 있었다(보안 4)
  - B. 메시지 본문 제한: 가드가 새 메시지 POST 본문을 32KB까지만 읽고(넘으면 413), 첨부·signal·initialData는 400 `message_rejected`. 횟수를 쓰기 전에 막는다. 화면은 `send-error.ts`의 `rejected`로 안내. 칸 수정 원하는 점 200자, 끼니당 메뉴 20개(`MAX_MENUS_PER_MEAL`, 화면은 앞 20개만, 서버 스키마는 거절)(보안 5)
  - C. 마이그레이션 0003: 오늘·어제 날짜 합계를 적용 시각의 시간 칸으로 옮긴다(그날 00시 칸이면 어제 값이 곧바로 창 밖)(코드 3). 로컬 D1은 고치기 전 0003이 이미 적용돼 `T00` 칸에 있다. 로컬은 그대로 둔다
  - D. 남은 예산으로 줄여 건 다시 추천이 시간 초과로 끝나면 `timeout`이 아니라 `stoppedForTime` + 지금 결과(위반). 호출별 상한에 걸린 시간 초과는 그대로 `timeout`. `MIN_REGENERATE_MS`를 2분으로(코드 2)
  - E. 사용량 계산이 NaN·Infinity·음수면 걸린 시간 × 2로 세고 알린다(`metered-harness.ts`). `usage-meter.ts`는 유한한 양수만 기록(보안 8)
  - F. bad_request 문구 "처음부터 다시"(코드 5), `plan-upgrade.md` 여유 계산 960 → 약 1,200(보안 11)
  - 확인: 테스트 567개, 타입 검사, 빌드
- [x] **T10-2. 메시지 하나가 비싼 도구를 여러 번 병렬로 부르지 못하게** (보안 1, 확신 중간) (B13, 2026-11-08): 바깥 모델이 한 응답에서 `create_week_plan`을 여러 번 부르면 메시지 1회가 생성 N회가 된다
  - 결정: `core/message-kind.ts`의 `messageKind`(접두어)로 인터뷰 뒤에는 그 종류 도구 하나만 마운트, 자유 문장은 도구 없음(화면 버튼 안내). 미들웨어도 같은 함수로 센다
  - 결정: 같은 도구 병렬 호출은 렌더마다 만드는 `ToolGate`(`core/tool-gate.ts`)로 첫 호출만. 진 호출은 `status: 'duplicate'`, 화면은 건너뜀. durable 도구는 `gate` step에 기록(복구 때 같은 호출이 이김). 도구 앞뒤는 `plan-tool-support.ts`의 `runGuarded`
  - gemma가 병렬 호출을 내는지는 여전히 모른다. 게이트는 단위 테스트로만 확인
- [x] **T10-3. 한 사람이 하루 한도를 다 쓰지 못하게** (보안 2, 확신 높음) (B13, 2026-11-08): 만들기 27회면 약 6,750~8,100 Neuron으로 안전선에 닿는다
  - 결정(사용자, 11-08): 종류별 하루 횟수. 분류 5, 만들기 5, 칸 수정 15(`USER_DAILY_KIND_LIMITS`). `usage_daily` key `<종류>:<userId>`, 마이그레이션 없음. 429 `user_kind_limit`, 문구는 종류별(`kindLimitMessage`), 화면은 서버 문구를 그대로 씀
  - 결정: 종류 횟수를 30회보다 먼저 센다(종류에서 막히면 30회를 쓰지 않음)
- [x] **T10-4. 동시 요청이 안전선을 넘치는 문제** (보안 3) (B13, 2026-11-08)
  - 결정: 진행 중 예약. 비싼 메시지는 최악의 양(분류 360, 만들기 1,200, 칸 수정 600 = 시간 예산 × 2/초, `RESERVE_NEURONS`)을 대화 ID로 `usage_reservations`(마이그레이션 0004)에 두고, `합계 + 만료 전 예약(같은 대화 제외) + 이번 예약량 > 8,000`이면 막는다. 도구가 끝나면 `release`(durable은 step), 못 지우면 20분(`RESERVATION_TTL_MS` = 제출 복구 한도) 뒤 만료. 에이전트가 202가 아니면 미들웨어가 바로 지움
- [x] **T10-5. 주가 밀릴 때 일정 날짜 안내** (코드 4) (B13, 2026-11-08): 기간 화면은 실제 날짜를 보여 주는데 `planWeekStart`가 주를 밀면 다른 주에 일정이 붙는다
  - 결정: `buildPlanNotices(profile, { chosen, weekStart, hasEvents })`가 맨 앞에 "고른 주(11/9~)가 이미 시작돼 다음 주(11/16~)로 만들었어요."(+ 일정이 있으면 "일정은 같은 요일·끼니에 넣었어요."). 만들기와 칸 수정 결과 모두(칸 수정에 `period` 전달)
- B13 확인: 테스트 620개(새 33개), 타입 검사, 빌드, 로컬 D1 0004. 로컬 데모 확인([기록](experiments/2026-11-08-b13-guard-local.md)). 원격 D1 0004 적용 뒤 B12와 함께 배포(버전 `f802d3d7`), 배포본에서 예약 정산·종류별 횟수 확인([기록](experiments/2026-11-08-b12-b13-deploy.md))
- 그 밖에 낮음: 바깥 턴 abort·실패 시 사용량이 빠짐(보안 7), 에러 message 로그에 사용자 메뉴 이름이 들어갈 수 있음(보안 10)

## 결정이 필요한 것 (스펙 10장)

| 열린 질문 | 언제까지 |
| --- | --- |
| 3. LLM 태그를 믿을 수 있는지 | T1-6 평가 결과를 보고 |

## 나중에

- 이름은 다르지만 주재료가 같은 메뉴의 반복 제한 (예: 닭가슴살 샐러드, 닭가슴살 볶음)
- 기다리는 화면의 "몇 칸을 다시 고르는 중" 안내 (스펙 7장). 도구 `log`는 대화에 안 나오므로 `useDataWriter` 같은 다른 통로가 필요하다. 지금까지 다시 추천 0회라 미뤘다
- "새로 만들기"를 누르면 지금 식단표를 다시 볼 방법이 없다 (대화 ID만 바뀜). 동의한 사용자는 D1에 식단표가 쌓이므로(B9) 지난 식단표 목록 화면을 만들 때 함께 정한다
- 대화 기록(Durable Object) 지우기 (B9 사용자 결정으로 미룸): "저장한 내 정보 지우기"가 이 사용자의 대화도 지우게 한다. 대화 ID 목록을 따로 기록해야 하고, Flue에서 대화를 지우는 방법을 조사해야 한다. 지금은 저장 동의 설명에 남는다고 안내만 한다
- 바깥 턴 문맥이 대화마다 커진다: 도구 결과의 식단표 JSON이 다음 턴 모델 입력에 다시 들어간다(칸 수정 턴 입력 2,234토큰). 모델에게는 짧은 요약만 보이게 할 방법을 찾는다
- 가짜 모드 확인 중 만들기 응답이 2분 늦게 시작한 적이 있다(오류 없음). 다시 보이면 원인을 찾는다
- llama-4-scout 출력 256토큰: Flue가 `max_completion_tokens`를 보내지 않아서다. cloudflare 공급자를 감싸 상한을 넣으면 분류를 llama(7초, 약 65 Neuron)로 되돌릴 수 있다. Flue를 올릴 때 공식 옵션이 생겼는지 본다
- 식단 생성 스키마(`plan-schema.ts`)도 gemma가 배열 대신 문자열 하나를 낼 수 있다. 지금까지 실패는 없었지만 메뉴 분류처럼 받아 줄지 정한다
- 프로필 확인의 "고치기"는 이전 답을 미리 채우지 않는다(목표만 채움). 끼니 표를 고치면 6끼를 다시 골라야 한다
- 메뉴 분류 품질: 국밥을 often으로 나눴고 이유가 "일반적인 식사라 식단 기준에 부합함"처럼 성의 없는 메뉴가 있다(B5 실제 1회). 프롬프트에서 메뉴마다 근거 기준과 주문 팁을 꼭 쓰게 하거나 gemma와 비교한다
- 모든 메뉴를 피하기로 고르는 것만 막는다. 외식 끼니가 여러 개면 한 끼니의 메뉴가 모두 피하기여도 만들 수 있고, 그러면 점검에서 실패한다. 끼니별로 막을지 정한다
- 제목에 주문 팁이 괄호로 들어가 주문 팁 칸과 겹친다("백반 (생선 반찬 고르기)"). 프롬프트에서 제목은 메뉴 이름만 쓰게 할지
- 첫 시연 이후 기능: 하루 재조정, 레시피, 지난주 체크 반영, 근육 증가 목표, 도시락
