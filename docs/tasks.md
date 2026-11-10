# 작업 목록

스펙(`docs/diet-coach-spec.md`) 9장 구현 순서를 task로 나눈 목록이다. 무엇이 맞는지는 스펙이, 무엇을 어떤 순서로 할지는 이 문서가 맡는다. task를 끝내면 체크하고, 새로 생긴 일은 알맞은 자리에 추가한다.

## 현재 상태 (2026-11-08 오후 기준)

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
- B11(T8-2, 11-08 0시경): 식단 생성 추론 수준 low도 8/8 통과지만 출력 토큰 중앙값 -7%, 시간 같음 → 기본값(medium) 유지 ([실험 기록](experiments/2026-11-07-b11-thinking-level.md)). (이 결정은 gemma 기준이다. 11-08 B14에서 식단 생성 모델을 gpt-oss-120b(low)로 바꿨다) 약 3,460 Neuron. GraphQL 최근 24시간 합계 7,068(11-08 0:39 KST). **11-08 10시(KST)까지 약 7,070, 그 뒤 23시경까지 약 5,970**이다(14·15시 UTC 칸이 빠질 때까지)
- B12(T8-3): 식단 도구 2개를 durable로. B13(T10-2~5): 도구 하나만 마운트 + 게이트, 종류별 하루 횟수, 진행 중 예약, 주 밀림 안내
- **세 번째 배포(11-08 1시 20분경 KST)**: 원격 D1에 0004 적용 → B12(durable 식단 도구) + B13(한도 보호 보강) 배포(버전 `f802d3d7`, 커밋 `0be4b45`까지). 배포본 실제 1회 통과: 만들기 245초 `ok`, Traces에 대화 내용 없음, 알람 호출 최장 19초(15분 가설 아님), 예약 걸림·정산, 종류별 횟수 쌓임 ([기록](experiments/2026-11-08-b12-b13-deploy.md)). 확인용 원격 토큰 1개(사용자 `efab2710a0cdc7a0`)를 새로 발급했다
- 한도: Cloudflare GraphQL 최근 24시간 합계 8,457(11-08 01:39 KST). 한국 9시에 약 1,100, 23~24시에 약 6,000이 창에서 빠진다
- B15(T11): 불가능한 식단 조건 사전 점검·같은 메뉴 횟수 자동 조정. 배포 버전 `521bf1b0`(11-08 10:55 KST)
- B14(T8-6, T8-7): 페르소나 E 픽스처, 모델 비교, **식단 생성·다시 추천 모델을 gpt-oss-120b(low)로** 바꿈. T8-6은 원인이 "메뉴 많음"이 아니라 불가능한 조건이었음이 B15에서 밝혀져 닫았다
- B16(T12): 분류 화면에서 무엇을 고치면 되는지. 배포 버전 `e52b5c78`(11-08 13:39 KST, 커밋 `23118b3`). 배포본 실제 만들기(13:52) 통과, 다시 추천 1회는 괄호 메뉴 버그 탓
- **배포 버전 `4198c930`(11-08 14:02 KST, 커밋 `c2025ae`)**: 괄호 메모 외식 메뉴 맞추기, 주문 팁 표기. 이 버전의 배포본 실제 확인 기록은 아직 없다
- **배포 버전 `e0e02f1d`(11-08 16:08 KST, 커밋 B17 `1719d08` + B19 `6393302` + 고침)**: 첫 시도는 시작 검증에서 실패(10021, 전역 평가 때 `env.AI`가 없어 `new Proxy(undefined)`). `watchBinding`이 객체가 아니면 그대로 넘기게 고쳐 다시 배포. `/api/ping` 200, 토큰 없는 `/api/me`·메시지 POST 401. B17·B19의 배포본 실제 확인은 아직(한도 넘음)
- 한도(11-08 14:11 KST): GraphQL 최근 24시간 합계 **10,744로 이미 넘음**. 23시 KST에 2,852(→ 약 7,890), 0시에 3,187(→ 약 4,700), 1시에 1,320이 빠진다. Neuron 작업은 23시 이후, 넉넉하게는 0시 이후

**알게 된 문제**
- 배포본에서 식단표가 8분 넘게 안 나왔다(11-06 밤). 생성 1회가 5분 46초(출력 토큰이 평소의 약 2배)였고, 다시 추천이 4분 제한에 걸렸다. "다시 시도"는 Durable Object 재시작으로 결과가 사라졌다 (T8 절). 대기 상한은 B10a로 막았다. 추론 수준으로는 속도가 줄지 않았다(B11). 결과 유실은 B12
- 배포본에서 실제 사용자의 만들기가 `timeout`으로 끝났다(11-08 01:28~01:36 KST). Workers AI 생성 응답이 5분 동안 한 바이트도 오지 않아 Flue가 끊고(`streamIdleTimeoutMs` 기본 5분) 다시 물었는데, 우리 생성 호출 상한 8분이 첫 시작부터 재고 있어 다시 묻는 호출이 3분 만에 잘렸다. 약 960 Neuron(시간으로 셈)을 쓰고 결과가 없었다. AI Gateway 기록을 보면 사용자가 직접 만든 3번은 모두 실패했고, 그 프로필은 생성 출력이 약 15,000토큰(페르소나의 약 2배)·5~6분이라 매번 시간 상한에 걸렸다. 평가와 실제 확인은 페르소나 픽스처로만 해서 놓쳤다. B14(T8-6, T8-7). **원인 정정(B15)**: 메뉴가 많아서가 아니라 외식 메뉴가 적어 규칙상 만들 수 없는 조건이었다. 사전 점검(B15)과 모델 교체(B14)로 막았다
- (가설 기각, 11-08) Durable Object 알람 15분 한도: 배포본 실제 1회 동안 알람은 10~20초 간격으로 짧게(최장 19초) 깨어날 뿐 응답 전체를 붙잡지 않았다. 11-06 재시작 원인은 모르지만 B12로 재시작돼도 결과가 남는다
- Workers AI 무료 한도가 00:00 UTC 초기화가 아니라 **최근 24시간 합계처럼** 동작했다 ([실험 기록](experiments/2026-11-07-t1-7-eval-personas.md)). 안전선은 B10a에서 24시간 합계로 바꿨다
- 보안 리뷰에서 나온 설계 과제(T10-2~5)는 B13 코드로 막았다(배포 전). 도구 하나만 마운트 + 게이트, 종류별 하루 횟수(5·5·15), 진행 중 예약, 주 밀림 안내

**다음 할 일 (순서대로)**
- **배포 버전 `d7baee7d`(11-08 20:43 KST, 커밋 `6a297ca`까지)**: B17·B18·B19·T15 모두 배포됨. 원격 D1 0005 적용(첫 시도 7403, 다시 하니 됨) → 배포. ping 200, 토큰 없는 `/api/me`·메시지 POST·`DELETE /api/profile` 401
- **배포 버전 `6455505b`(11-08 20:58 KST, 커밋 `8e57db3`까지)**: T16·T17 배포. 원격 D1 0006 적용 → 배포. ping 200, 토큰 없는 `/api/conversations` 401
- 식단 생성 스키마 보강(11-08, 배포 전): `plan-schema.ts`가 배열 필드(ingredients·tags·criterionIds)에 값 하나 문자열·null을 받고 `toPlanCells`가 배열로 맞춤, orderTip null은 없앰(메뉴 분류 스키마와 같은 방식). 지금까지 실패는 없던 예방 조치. gpt-oss가 바뀐 JSON 스키마(anyOf)로도 정상 출력하는지는 다음 실제 만들기에서 본다
- 한도(11-08 20:35 KST): 최근 24시간 합계 10,744로 아직 넘음. 23시에 약 7,890(여유 약 2,100), 0시에 약 4,700(여유 약 5,300)
1. ~~B18·T15 배포~~ 끝남(`d7baee7d`)
2. 배포본 실제 확인: **11-09 페르소나 E 2회로 대부분 확인**([기록](experiments/2026-11-09-persona-e-deploy.md)). B17·B18·B19·T17·T18·B21 정상. T15 "내 기록 모두 지우기"만 남음. T13-1은 미해결(아래), T13-4는 이번엔 맞음. (원래 계획: 만들기 1회 약 500 Neuron. B17(외식 제목 괄호 없음, 주문 팁, 이유 근거, `refined_carb_main`), 괄호 메뉴가 다시 추천 없이 맞는지, B19(`usage.stream`이 찍히는지 = AsyncLocalStorage 전파), 다시 추천이 나면 B18(입력 2~3천 대), T15(배포본에서 "내 기록 모두 지우기" 1회). 필요하면 로컬 페르소나 E 2회(약 1,000~1,500, 0시 이후)로 T13-1·T13-4와 열린 질문 3을 판단
3. ~~`streamIdleTimeoutMs` 줄이기~~: B22(T22-1)에서 90초로 줄임(배포 전). 효과는 다음 배포본 만들기의 `usage.stream`으로 본다
4. 프로필 "고치기" 이전 답(T16): 끝남(배포 전)
5. ~~지난 식단표 목록(T17)~~: 11-09 배포본 실행에서 `plan_at`이 찍혀 목록에 올라옴([기록](experiments/2026-11-09-b22-deploy-user-run.md))
6. ~~식단 생성 스키마 보강, 같은 주재료 반복 제한(T18)~~: 11-09 배포본 실행에서 gpt-oss 정상 출력, 집밥 칸마다 `mainIngredient`, 위반 없음
7. 2차 리뷰(T19): B20·B21 끝남, T19-8(Collect Logs 끔). **배포 버전 `7f1371a9`(11-09, 커밋 `d8bbafd`까지, 마이그레이션 없음)**: ping 200, 토큰 없는 `/api/me`·메시지 POST·`/api/conversations` 401. 바깥 턴 도구 호출은 11-09 배포본 실행에서 확인(단계마다 한 번씩). busy·chat 거절은 배포본에서 아직 안 봄
8. ~~B22(T22)~~: 배포함(`77d24c58`). 11-09 배포본 실행에서 메시지 스트림 정상(CSP), 최장 간격 2.46초. 90초 재요청은 멈춤이 날 때만 보인다
9. "나중에" 절. mistral-small 비교는 지금 모델에 문제가 없으면 생략

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
| B16. 무엇을 고치면 되는지 | T12-1 ~ T12-4 | B15 배포 뒤 사용자가 분류 화면 경고만으로 어떤 메뉴를 고칠지 몰랐다. 끼니별 묶음, 해결 방법, 외식 메뉴 고치기, 이전 분류 재사용 | 로컬 데모 분류로 화면 흐름 확인(약 10). 실제 분류기로 새 메뉴만 가는지는 사용자 확인 뒤(약 200) |
| B15. 불가능한 식단 조건 | T11-1 ~ T11-4 | 배포본 사용자 실패의 실제 원인(외식 메뉴가 적어 규칙상 불가능). 사전 점검, 같은 메뉴 횟수 자동 조정, 화면 안내가 한 함수를 쓴다 | 불가능 페르소나는 LLM 없이 끝나는지(데모, 약 5) + 조정 페르소나 gemma 1회(약 300~500) |
| B14. 긴 생성과 모델 비교 | T8-6, T8-7 | 사용자 프로필(메뉴 많음)에서 생성이 5~6분 걸려 시간 상한에 걸린다. 재현용 픽스처를 먼저 만들고, 같은 조건에서 멈춤 감지 조정과 모델 교체를 함께 비교한다 | 픽스처로 gemma·gpt-oss-120b(low/medium)·mistral-small 각 2회. 약 2,500~4,000 Neuron |
| B17. 생성 결과 품질 | T13-1 ~ T13-4 | 모두 생성·다시 추천 프롬프트 한 곳을 고친다. 실제 확인이 gpt-oss 반복 측정과 열린 질문 3(태그 신뢰) 판단을 겸한다 | 페르소나 E 등 2~3회. 약 1,000~1,500 Neuron |
| B18. 다시 추천 비용 | T14-1 | gpt-oss로 바꾸며 입력 단가가 약 3.5배라 다시 추천 문맥이 비싸졌다 | 다시 추천이 나는 경우 1~2회 |
| B19. 멈춤 원인 안내 | T8-8 | 시간 초과 종류(무응답, 호출 상한, 도구 예산)를 화면에서 구분. 화면 상태 함수 TDD | 없음 |
| B20. 리뷰 정확성 버그 | T19-1 ~ T19-5 | 11-08 서브 에이전트 코드 리뷰. 사전 점검 지수 시간(탭·DO 멈춤)이 가장 급하다. 모두 순수 로직·화면 상태 TDD | 없음 |
| B21. 바깥 턴 비용 보호 | T19-6 ~ T19-8 | 11-08 서브 에이전트 보안 리뷰. 자유 문장 메시지만으로 전체 한도를 쓸 수 있다. 요청 앞단·바깥 턴 요청 보정 자리라 함께 정한다 | 로컬 데모 바깥 턴 몇 회(약 20 Neuron) |
| B22. "나중에" 정리 | T22-1 ~ T22-6 | "나중에" 중 Neuron 없이 바로 끝나는 것(2026-11-09 사용자 선택): 무응답 재요청, 보안 헤더, 목록 순서, 지우기 경쟁, 메뉴 오타 안내, 대화 ID 형식 | 없음 (빌드본 화면 로드만, Neuron 0) |
| B24. 초대 코드로 직접 토큰 받기 | T24-1 ~ T24-4 | 운영자가 사람마다 토큰 링크를 만들지 않게(사용자 요청 2026-11-10). 저장소·API·화면이 한 흐름이라 함께 한다 | 없음 (발급은 LLM을 부르지 않음, Neuron 0) |
| B23. 분류에서 태그 정하기 (되돌림) | T13-4 | 외식 칸 태그가 실행마다 달라(샌드위치 `refined_carb_main`) 분류가 메뉴마다 한 번 정하게 해 봤다. 메뉴 30개에서 분류가 너무 비싸 되돌림 | 실제 약 5,700 Neuron(계획 1,000~1,500 초과) |
| 평가 세트 확장 | T1-7 | 열린 질문 1은 2026-11-07에 정했다. 생성 방식이 바뀌는 B11 뒤에 한 번만 돌린다 | 페르소나 B·C·D 각 2회. 약 3,000~4,000 Neuron |

순서: B1 → … → B10c 조사 → T10-1 → 두 번째 배포 (끝남) → B11(+ T8-5 실험) → B12 코드 → B13 → B12·B13 함께 배포·실제 1회 → T1-7 → B14 → B15 → B16 (끝남) → 배포본 확인 → B17 → B18 → B19. T1-7은 하루 한도가 넉넉한 날, Cloudflare 대시보드에서 그날 사용량을 확인하고 돌린다.

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

- [x] **T8-6. 메뉴 많은 프로필에서 생성이 5~6분 걸리는 문제** (B14, 사용자 결정 2026-11-08: 실험 작업으로) (2026-11-08 닫음)
  - **정리(2026-11-08)**: 원인은 "메뉴 많음"이 아니라 규칙상 만들 수 없는 조건이었다(T11). 페르소나 E(메뉴 많음)에서는 gemma도 느려지지 않아 재현되지 않았다(T8-7 4차). 할 일 2는 B15(사전 점검)와 모델 교체(gpt-oss-120b low, 27~72초)로 대신해 하지 않는다. 할 일 3은 T8-8로 뗐다. 평가 세트에는 페르소나 E를 넣었다
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
- [x] **T8-8. 멈춤 원인을 나눠 안내** (B19, T8-6 할 일 3에서 뗌) (2026-11-08): 지금은 시간 초과면 모두 "응답이 너무 오래 걸려 멈췄어요"다. 모델 무응답(Flue `streamIdleTimeoutMs`), 호출별 상한, 도구 전체 예산을 구분해 "모델이 응답하지 않아 멈췄어요"처럼 안내하고, 다시 시도가 의미 있는지도 다르게 보인다. 도구 결과에 원인을 실을 모양부터 정한다
  - 조사: Flue의 무응답 감지(`withStreamIdleDeadline`)는 내부 재요청만 하고 알려 주지 않는다. 우리 signal은 `AbortSignal.any`로 감싸져 공급자에 가서 signal로 호출을 이을 수 없다. Flue도 AsyncLocalStorage를 쓰고 `nodejs_compat`이 켜져 있다
  - 결정: 호출마다 AsyncLocalStorage 저장소(`prompt-call.ts`의 `promptWatched`)를 열고, 바인딩 `run`을 감싸(`stream-watch.ts`, `provider.ts`) 응답 바이트 시각만 잰다. 원인 `stalled`(바이트 없는 간격 2분 이상) → `budget`(예산이 상한을 줄임) → `call_limit` 순서. 문구는 `TIMEOUT_MESSAGES`, 화면 코드는 그대로(도구 결과 message를 보여 줌), 다시 시도는 모두 있음. 실패 로그에 `reason`·`stream`
  - 성공한 식단 호출은 `usage.stream`(요청 수, 첫 바이트, 최장 간격)을 싣는다. 오늘 밤 B17 실제 확인에서 AsyncLocalStorage가 Flue 안까지 이어지는지(`requests ≥ 1`)와 실제 간격을 본다
  - 확인: 테스트 740개(새 17개), 타입 검사, 빌드. 무응답 자체는 일부러 만들 수 없어 단위 테스트로만
- [x] **T8-7. 식단 생성 모델 비교 실험** (B14, 실제 모델, 사용자 결정 2026-11-08: 실험 작업으로)
  - **결정(사용자, 2026-11-08 12시경): 식단 생성·다시 추천을 gpt-oss-120b(low)로 바꾼다.** 배포본에서 gemma 생성 233초 뒤 다시 추천이 4분 제한을 넘겨 `timeout`(AI Gateway 11:19~11:27 KST). B14 비교에서 gpt-oss low 27~72초. `models.ts`의 `PLAN_DEFAULT_MODEL`·`PLAN_DEFAULT_THINKING`, 대기 문구 "1~2분". 남은 것: 이유 문장 근거 오류(프롬프트 규칙), 빈 주문 팁, 더 많은 반복 측정
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
  - 진행 3차(2026-11-08 08:33 KST, 사용자 결정: gpt-oss low만 지금): **페르소나 E에서 72초, 출력 3,585토큰, 306 Neuron, 첫 생성에 `checkPlan` 통과**(재요청·다시 추천 없음) ([기록](experiments/2026-11-08-b14-gpt-oss-low-run.md)). 약 376 Neuron. 바깥 턴(gemma)은 바뀐 접두어 조건 지시로 도구를 정상 호출. 품질 확인할 점: 흰 식빵 칸에 `refined_carb_main` 태그 누락(흰쌀밥은 스펙상 대상 아님), 외식 칸 주문 팁 빈 곳 많음. 1회라 흔들림은 모름
  - 진행 4차(2026-11-08 09:16~09:22 KST, 사용자 결정: gpt-oss low 1회 → gemma 1회): gpt-oss 27초·출력 4,703·382 Neuron, gemma 207초·출력 7,377·220 Neuron, 둘 다 첫 생성 통과 ([기록](experiments/2026-11-08-b14-compare.md)). 약 730 Neuron. **gemma도 페르소나 E에서는 느려지지 않아 사용자 경우를 재현하지 못했다.** 문장은 gpt-oss가 구체적이나 틀린 근거("된장은 정제 탄수화물을 줄이는 데 도움" 등)가 섞이고 gemma는 밋밋함. 주문 팁 빈 칸은 두 모델 공통(프롬프트 문제로 보임). 더 돌릴지는 사용자가 남은 한도를 보고 정함
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

### T24. 초대 코드로 직접 토큰 받기 (B24, 2026-11-10)

로그인 없이, 공용 초대 코드를 가진 사람이 처음 들어올 때 개인 토큰을 받아 localStorage에 둔다. 결정(사용자, 11-10): 공용 코드 + 코드당 사용 상한 + IP당 하루 상한. 1회용 코드는 사람마다 전달해야 해서 지금의 토큰 링크 발급과 다르지 않아 택하지 않음. Cloudflare Access(이메일 일회용 코드)는 고칠 곳이 많아 보류

- [x] **T24-1. 저장소:** `migrations/0007_invites.sql`(`code_hash`, `max_uses`, `used`), `GuardStore.registerWithInvite`(확인·증가 한 문장 `UPDATE … WHERE used < max_uses RETURNING`, 그다음 사용자 넣기), `tryCountRegister`(`usage_daily` 재사용). 계약 테스트 4개(Memory·D1)
- [x] **T24-2. API:** `POST /api/register { code }` → `{ token, userId }` (`server/register-routes.ts`). 순서: IP 하루 시도 5회(성공·실패, 본문이 틀려도 센다) → 본문 1KB·코드 모양 → 코드 사용. 틀린 코드·다 쓴 코드 같은 400 `invalid_invite`, IP 초과 429 `register_limit`. IP는 `SHA-256(day|ip)` 앞 16자를 key로만(`core/registration.ts`). 코드는 Crockford base32 12자(60비트), 입력은 공백·하이픈 무시·대소문자 무시
- [x] **T24-3. 코드 만들기:** `npm run issue-invite -- --local|--remote --max N [--origin …]`가 코드·링크(`/?invite=XXXX-XXXX-XXXX`)·해시를 한 번 출력. 폐기는 `UPDATE invites SET max_uses = used WHERE code_hash = '…'`
- [x] **T24-4. 화면:** `AccessGate`가 토큰 없음·401이면 `InviteView`(링크 코드는 주소에서 지우고 바로 보냄), 받으면 `MyLinkView`(개인 링크·복사·"링크를 가진 사람은 내 기록을 볼 수 있다" 안내) 뒤 App. App 아래 "다른 기기에서 열기"(`MyLinkFoot`). 순수 로직은 `ui/invite.ts`
- 확인: 테스트 918개(새 33개), 타입 검사, 빌드. 개발 서버 Chrome(Neuron 0): 토큰 없음 → 코드 화면 / `/?invite=` → 주소에서 지움·링크 안내 → 시작하기 → 인터뷰, `/api/me` 200 / 새로고침 유지 / `--max 2` 코드 2번째(소문자·공백 입력) 성공, 3번째 400 / 같은 IP 6번째 시도 429 / 모르는 저장 토큰 → 코드 화면, 폼 제출 오류 문구 표시
- [x] **T24-6. 리뷰 반영** (11-10 서브 에이전트 리뷰): ① IPv6는 /64 안에서 주소를 바꿔 IP 상한을 피하고 코드를 혼자 다 쓸 수 있었다 → `ipBucket`(IPv6 /64로 묶음), 코드 하루 사용 10회(`invite:<해시 앞 16자>`) ② 토큰 없는 API가 시도마다 D1에 써서 주소를 돌리면 쓰기 한도를 쓸 수 있었다 → 전체 하루 시도 200회(`register:all`)를 먼저 확인 ③ 모바일망 IP 공유 → IP 상한 5 → 10 ④ localStorage 저장 실패(사생활 보호 창)를 링크 안내 화면에 알림(`saveToken`이 boolean) ⑤ `AccessGate` 상태 판단을 `ui/access-state.ts`로 빼서 테스트. 남긴 것: 코드 사용·사용자 넣기가 두 문장(넣기 실패 시 코드 자리 하나 손실, 사실상 없음), 코드 해시 솔트 없음(유출 시 폐기), `usage_daily` 지난 행 정리 없음(전체 상한으로 하루 약 400행 이하), `/api/register` WAF 속도 제한("나중에"의 WAF와 함께). 테스트 931개(새 13개)
- [ ] **T24-5. 배포:** `npx wrangler d1 migrations apply diet-coach --remote` → `npm run deploy` → `npm run issue-invite -- --remote --origin https://diet-coach.jjangyeesoo1.workers.dev`. 외부 공개라 사용자 확인 뒤

### T22. "나중에" 정리 (B22, 2026-11-09)

"나중에" 절에서 Neuron 없이 바로 할 수 있는 것. 사용자가 기본 4개에 메뉴 오타 안내·대화 ID 형식 검사를 더해 골랐다. 남긴 것: 다시 추천 안내, 분류 화면 메뉴 추가, T15 이전 대화, 목표 메모 오분류, 가짜 모드 지연, 분류 품질, 토큰 만료·폐기, WAF

- [x] **T22-1. 무응답 재요청 5분 → 90초**: `provider.ts`가 `streamIdleTimeoutMs: STREAM_IDLE_MS`(90초, `core/llm-timeout.ts`). 11-09 gpt-oss 정상 생성의 최장 간격은 0.69초. gemma(분류·바깥 턴)는 실측이 없어 60초가 아니라 90초. 무응답 판정 `STALL_MS`는 2분 → 60초(Flue가 90초에 끊고 다시 물은 경우도 `stalled`로 잡히게 `STALL_MS < STREAM_IDLE_MS`)
- [x] **T22-2. 보안 헤더와 SRI** (2차 리뷰 낮음): 화면은 `public/_headers`(CSP: 스크립트 self, 스타일·글꼴은 Google Fonts·jsdelivr만, `frame-ancestors 'none'`, `base-uri 'none'`; `Referrer-Policy: no-referrer`(링크에 토큰); `nosniff`). vite dev에는 적용되지 않는다(플러그인 실험 옵션을 켜지 않음). Worker가 처리하는 `/api/*`·`/agents/*`는 `server/security-headers.ts`(CSP `default-src 'none'`, `X-Frame-Options: DENY` 등)를 `app.ts` 맨 앞에. `hono/secure-headers`는 Durable Object 응답 헤더가 바뀌지 않아 500이 나서(preview에서 찾음) 바꿀 수 없으면 복사해서 붙인다. WebSocket(101) 응답은 그대로. Pretendard CSS에 `integrity`(sha384, 두 번 받아 같음)·`crossorigin`. Google Fonts CSS는 브라우저마다 달라 SRI 없음
- [x] **T22-3. `json_group_array` 순서** (2차 리뷰 낮음): `conversationsOf`(시각 함께 받아)·`planConversations` 모두 JS에서 다시 정렬. LIMIT은 하위 쿼리 ORDER BY 그대로
- [x] **T22-4. "모두 지우기"와 진행 중 저장의 경쟁** (2차 리뷰 낮음): `GuardStore.hasActiveReservation`. 같은 사용자 예약(만들기·분류·칸 수정 진행 중)이 있으면 `DELETE /api/profile`이 409 `busy`로 아무것도 지우지 않는다. 화면은 "식단표 만들기 같은 요청이 아직 진행 중이에요. 끝난 뒤 다시 지워 주세요."(링크 유지)
- [x] **T22-5. 메뉴 오타 안내** ("샌다위치"/"샌드위치"): `core/menu-typos.ts`의 `similarMenus`가 외식 메뉴 중 공백 뺀 이름이 한 글자(바꾸기·넣기·빼기)만 다른 쌍(3글자 이상, 끼니 상관없이)을 찾고, 프로필 확인 화면에 안내만 한다(막지 않음, 고쳐 주지 않음). 같은 메뉴 판정(`menuKey` 정확히 일치)은 그대로
- [x] **T22-6. 대화 ID 형식** (2차 리뷰 낮음): `ownsConversation`이 접두어 뒤를 `/^[A-Za-z0-9-]{1,80}$/`로 제한(화면 UUID, 평가 `eval-<uuid>`). userId 자체는 서버가 토큰으로 찾은 값이라 검사하지 않는다
- 확인: 테스트 858개(새 22개), 타입 검사, 빌드. `vite preview`(빌드본, Neuron 0)에서 Chrome: CSP·SRI 위반 없음, Pretendard 적용, 인터뷰 화면까지 로드, `/api/*`·`/agents/*`(404 포함)·401에 헤더. T22-5 화면 표시는 인터뷰를 끝까지 가야 해(목표 메모 확인 LLM) 단위 테스트로만 확인
- **배포 버전 `77d24c58`(11-09 저녁, 커밋 `47cc3a4`까지, 마이그레이션 없음)**: ping 200, 화면·API 응답에 헤더, 토큰 없는 `/api/me`·`/api/conversations`·메시지 POST 401. Chrome(저장된 토큰)으로 화면 로드: `/api/me`·`/api/profile`·대화 기록 GET 200, Pretendard 적용, CSP·SRI 위반 없음. 메시지 스트림도 같은 날 사용자 만들기 1회로 정상 확인([기록](experiments/2026-11-09-b22-deploy-user-run.md))

### T19. 2차 코드·보안 리뷰 (2026-11-08, 서브 에이전트)

테스트 806개·타입 검사는 통과한 상태에서 나온 것. 재현 스크립트는 세션 스크래치패드에만 있었다(프로젝트 밖). T19-1~5는 B20, T19-6~8은 B21

- [x] **T19-1. 사전 점검 지수 시간** (코드 1, 높음, 재현함): `plan-feasibility.ts`의 `findEatOutAssignment` 백트래킹. 평일 세 끼 외식(메뉴 n개씩) + 주말 저녁 외식 메뉴 1개면 n=3에서 1.7초, n=4에서 60초 넘게 안 끝남(끼니당 20개까지 입력 가능). 프로필 확인 화면 렌더(`profileStepHint`, `MenuClassView`, `class-groups`)·`checkPlan`·만들기 도구가 같은 함수를 불러 탭과 DO가 멈춘다. 메모이제이션, 끼니별 분해, 탐색 상한 중 하나 + 큰 메뉴 수 성능 테스트
- [x] **T19-2. 외식 끼니의 집밥 칸** (코드 2, 중간, 재현함): 끼니 설정이 외식인 칸에 `place: 'home'`이면 어떤 규칙에도 안 걸린다(분류 규칙 우회). 스펙 3.2에 칸 place와 끼니 설정 place 비교 규칙을 더한다
- [x] **T19-3. 분류된 메뉴를 집밥 칸에 넣으면 횟수 제한 없음** (코드 3, 중간, 재현함): `check-plan.ts`의 `strictKeys`가 `menu_weekly_limit`에서 칸 종류와 관계없이 빠지는데 `class_*`는 외식 칸만 본다. 제외를 외식 칸에만 적용하고 스펙 3.2 문구도 고친다
- [x] **T19-4. (T16 회귀) "메뉴가 적어요" 추가 질문에 예전 메뉴가 다시 채워짐** (코드 4): `interview-form-state.ts`가 ask 동안 `previous`를 넘겨, 메뉴를 고친 뒤 추가 질문 입력란에 지운 메뉴가 채워진다. `few_menus`면 `menusText`를 채우지 않는다 + 테스트
- [x] **T19-5. 만들기 도구의 try 밖 계산** (확인 필요): `create-plan-tool.ts:93-115`의 `planContext`(`buildCriteria`는 goals가 비면 던짐)·`planFeasibility`가 try 밖. "도구는 던지지 않는다" 규칙에 맞춘다
- B20 결정·확인 (2026-11-08, Neuron 0)
  - T19-1: 시간순 백트래킹을 후보가 가장 적은 외식 칸 먼저(MRV) + 앞질러 점검(이웃 칸·횟수를 다 쓴 메뉴를 후보에서 미리 지움)으로. 집밥 칸은 탐색에서 뺌. 노드 상한 `SEARCH_NODE_LIMIT`(20만)을 넘으면 `'unknown'`이고 `planFeasibility`는 그 횟수로 **가능**으로 본다(사용자를 잘못 막지 않음, 모델 결과는 checkPlan이 거름). 리뷰 재현 프로필(평일 세 끼 메뉴 20개씩 + 주말 저녁 메뉴 1개)이 60초 이상 → 2~3ms. 기존 시간순 탐색(테스트의 참조 구현)과 무작위 작은 프로필 300개 × 횟수 6개(가능 536, 불가능 1,264)에서 결과가 같다
  - T19-2: 새 규칙 `place_mismatch`(`RULE_IDS`에서 `missing_cell` 뒤, 칸마다, regenerate 그 칸). `finishCells`로 place를 덮는 대신 점검 기준인 checkPlan이 잡는다. 걸린 칸을 다른 규칙에서 빼지는 않는다. 스펙 3.2, 8.2 30~31
  - T19-3: `menu_weekly_limit`의 분류 제외를 외식 칸에만. 집밥 2번 + 외식 1번처럼 섞인 경우는 집밥만 세어 걸리지 않는다(외식은 `class_*`가 맡음). 스펙 3.2, 8.2 32
  - T19-4: `stepDefaults`가 `few_menus` 추가 질문이면 메뉴를 채우지 않는다
  - T19-5: `prepareSafely`(`plan-tool-support.ts`)로 만들기의 `planContext`+사전 점검, 칸 수정의 `planContext`를 감싸 실패 결과(error)로 답한다. 'start' step 전이라 step은 그대로
  - 확인: 테스트 817개(새 11개), 타입 검사, 빌드
- [x] **T19-6. 자유 문장 메시지의 비용 상한** (보안 1, 높음): 접두어 없는 메시지는 `used >= 8000`만 보고 예약·종류 횟수가 없다. 바깥 턴은 대화 기록 전체를 보내고 gemma 출력 상한이 없어(`OUTPUT_CAPS` null), 32KB 메시지를 한 대화에 계속 보내면 하루 30회 안에서 수천 Neuron, 대화 ID를 바꿔 동시에 보내면 안전선 검사를 함께 통과한다. 후보: 인터뷰 뒤 chat 거절 또는 chat 본문 상한 1~2KB, 바깥 턴 요청을 system + 마지막 user로 자르기, 바깥 턴 출력 상한(예: 1,024), 사용자당 동시 진행 1건
- [x] **T19-7. 예약 경쟁** (보안 2, 중간): 조회 → 횟수 → 예약이 원자적이지 않고, 예약 key가 대화 ID라 같은 대화에 비싼 요청을 연달아 보내면 덮어써지고 첫 도구가 끝나면 지워진다(피해는 종류별 횟수 안). 메시지별 key, 사용자당 비싼 요청 동시 1건
- [x] **T19-8. AI Gateway 본문 로깅 확인** (11-08 Collect Logs 끔. 쌓인 로그는 본인·테스트 페르소나 것뿐이라 지우기는 선택) (사용자, 대시보드): `default` 게이트웨이가 프롬프트·응답을 남기면 인터뷰 답·복용약이 저장돼 트레이스 `content:false`가 무력해진다. 본문 로깅을 끄거나 보존 기간을 줄였는지 본다
  - 확인(11-08): **남고 있다.** Logs 상세에 Request(식단 생성 프롬프트 전체)·Response 본문이 보인다. Settings의 Collect Logs가 켜져 있고(설명: "Store request and response payloads"), 메타데이터만 남기는 옵션은 없다. 상한 100,000개, 오래된 것부터 자동 삭제. Log Classification(Cloudflare 분석)은 꺼져 있다
  - 제안: Collect Logs를 끄고 지금까지 쌓인 로그를 지운다. 호출 시각·토큰·상태가 필요하면 테스트 페르소나로 확인할 때만 잠깐 켠다. 우리 쪽 기록(`usage_hourly`, B19 `usage.stream`)으로 대부분 대신한다
- B21 결정·확인 (2026-11-09)
  - T19-6: chat은 미들웨어가 400 `message_rejected`. 바깥 턴 요청은 `fitRequest`(`output-caps.ts`)가 system + 이번 사용자 메시지부터만 보내고 출력 상한 2,048(`OUTER_TURN_MAX_TOKENS`), 바깥 턴 추론은 모두 low. Flue가 요청 뒤에 붙이는 `<signal>` user 기록은 요청으로 보지 않는다(실제 확인에서 찾음). 목표 메모 확인 프롬프트 첫 줄도 `FINISH_ONLY`(자르기에서 빠지게)
  - T19-7: 예약 key를 사용자 ID로, 같은 사용자 진행 중이면 429 `busy`. 검사와 예약을 D1 문장 하나(`GuardStore.tryReserve`, `ok|busy|over_limit`). 종류 횟수·30회에서 막히면 예약을 지움. 도구가 돌지 않은 응답도 `useResponseFinish`에서 한 번 더 지움(실제 확인에서 찾은 누수: 인터뷰 전 분류 요청이 사용자를 20분 막음). 마이그레이션 없음
  - 확인: 테스트 830개, 타입 검사, 빌드. 로컬 데모 실제 확인: 도구 4종 모두 호출, 바깥 턴 입력이 대화가 길어져도 약 550~625(전 2,234), busy 429, chat 400. 약 650 Neuron(버그 두 개를 찾느라 세 번 돌림, 목표 메모 6회) ([기록](experiments/2026-11-08-b21-outer-turn.md))
- 낮음 (나중에 절에 둠): 보안 헤더·`no-referrer`·외부 CSS SRI, 토큰 만료·폐기·"이 기기에서 로그아웃", userId 형식 검사(`/^[0-9a-f]{16}$/`), 인증 전 요청 속도 제한(WAF), 사용자당 대화 수 상한, "모두 지우기"와 진행 중 저장의 경쟁, D1 `json_group_array` 순서 보장
- 문제없음 확인: 토큰(256비트, SHA-256 해시 저장), 대화 소유(Hono 경로 변형 13가지 우회 없음), `/api/me`·`/api/profile`·`/api/conversations`, SQL `bind`, XSS 지점 없음, `.dev.vars` 커밋 이력 없음, T18 규칙·스펙 일치, `metered()`·`limitMs`·durable step 배치. `npm audit` high 3건은 MCP SDK(앱이 쓰지 않음, `audit fix --force`는 Flue를 내리니 쓰지 않는다)

### T18. 같은 주재료 반복 제한 (2026-11-08, "나중에"에서 옮김)

"닭가슴살 샐러드", "닭가슴살 볶음"처럼 이름이 다르면 주재료가 같아도 매일 나올 수 있었다. 사용자 결정: 주재료는 LLM이 칸마다 적고(판단은 LLM, 점검은 코드), 주 3번까지 + 바로 앞 끼니 금지

- [x] **T18-1. 규칙** (`checkPlan`, `RULE_IDS`의 `menu_weekly_limit` 뒤): `main_ingredient_consecutive`(이어진 두 집밥 칸, 같은 메뉴 쌍은 `consecutive_menu`만), `main_ingredient_weekly_limit`(주 3회 초과, `MAIN_INGREDIENT_WEEKLY_MAX`). 집밥이면서 `mainIngredient`가 있는 칸만, `menuKey`로 비교. 스펙 3.2 표, 8.2 테스트 24~29
- [x] **T18-2. 데이터와 프롬프트**: `PlanCell.mainIngredient?`(선택, 없으면 규칙에서 빠짐: 예전 식단표·데모 픽스처), 스키마 nullish, `toPlanCells`가 null·빈 값 제거, `finishCells`가 공백 제거. 프롬프트 칸 작성 방법·규칙 한 줄, 다시 추천의 지금 식단표 줄에 "(주재료: …)"
- 결정: 외식은 보지 않는다(메뉴 규칙이 있고, 넣으면 메뉴 적은 사용자가 더 자주 불가능해짐)
- 확인: 테스트 806개(새 10개), 타입 검사, 빌드. 실제 확인(배포본 만들기 1회에 함께): 집밥 칸에 `mainIngredient`가 채워지는지, 다시 추천이 늘었는지. 자주 늘면 횟수나 프롬프트를 다시 본다

### T17. 지난 식단표 목록 (2026-11-08, "나중에"에서 옮김)

"새로 만들기"를 누르면 지금 식단표를 다시 볼 방법이 없었다. 사용자 결정: 지난 대화를 다시 연다(저장 동의와 관계없이, 칸 수정도 이어짐), 화면 아래 링크

- [x] **T17-1. 대화에 식단표 표시** (마이그레이션 0006 `plan_week_start`·`plan_at`, `GuardStore.markConversationPlan`·`planConversations`, 계약 테스트): 만들기·칸 수정 도구가 성공하면 `mark` step(`markPlanQuietly`, 실패해도 경고만). `UserStore`에 `conversationId`·`guard`
- [x] **T17-2. `GET /api/conversations`** (`server/conversation-routes.ts`): 식단표 있는 자기 대화, 최근 순 20개
- [x] **T17-3. 화면**: `PastPlansLink.tsx`(화면 아래, 그 자리에 목록, 지금 대화 표시), `past-plans.ts`(파싱, "11/9(월)부터 1주일 · 11/8 20:43" 한국 시간, 상태). `App.tsx`의 `openConversation`(지금 대화 진행 값 지우고 옮김, `moveToNewConversation`과 `switchConversation`을 같이 씀). 화면 아래는 `page-foot`으로 묶음
- 이 열 전에 만든 식단표는 목록에 없다(다음 만들기부터)
- 확인: 테스트 792개(새 15개), 타입 검사, 빌드. 로컬(5288, Neuron 0): 대화 2개를 D1에 표시해 두고 Chrome으로 목록(시간 한국 시간), 고르면 그 대화로 옮겨 "지금 보는 식단표" 표시. 실제 만들기로 목록에 저절로 올라오는지는 23시 이후 데모 생성기로(약 10 Neuron)
- 배포 순서: 원격 D1에 0006 → `npm run deploy`(도구의 mark는 실패해도 경고만이지만 `/api/conversations`가 500이 된다)

### T16. 프로필 "고치기"에 이전 답 채우기 (2026-11-08, "나중에"에서 옮김)

- [x] **T16-1. 이전 답 채우기**: `FormProgress.prefill`(메뉴만, B16)을 `previous`(고치기 직전 초안·추가 질문 기록)로 넓힘. `stepDefaults`가 지금 단계의 이전 답(목표·메모, 복용약, 피할 음식·메모, 6끼, 메뉴 문자열, 조리 시간). 다시 확인 화면이 되면 `previous`를 버림. 예전 저장 진행(`prefill`)도 복원됨
- [x] **T16-2. 끼니 표 고치기**: `carryMealDetails`로 장소가 같은 끼니의 메뉴(외식)·조리 시간(집밥)과 "메뉴가 적어요" 추가 질문 기록을 이어 붙임. 장소를 바꾼 끼니만 다시 묻고, 같이 먹는 사람만 바꾸면 그대로
- [x] **T16-3. 화면**: 목표·피할 음식·끼니 단계가 이전 답으로 시작. 복용약·조리 시간은 이전 답 버튼에 "지금 답"(`aria-pressed`)
- 결정: 목표를 고치면 복용약은 지금처럼 다시 묻는다(목표에 따라 묻는 질문)
- 확인: 테스트 777개(새 10개), 타입 검사, 빌드. 로컬 개발 서버(5288, Neuron 0) Chrome: 목표·피할 음식 고치기에 이전 답이 채워짐, 조리 시간 "20분 · 지금 답", 끼니 표 그대로 → 바로 확인 화면, 평일 저녁 집밥 → 외식이면 그 메뉴만 묻고 평일 점심 메뉴는 남음

### T15. 대화 기록 지우기 (2026-11-08)

인터뷰 답과 식단표가 대화(Durable Object)마다 남는데 지울 방법이 없었다. "저장한 내 정보 지우기"는 D1만 지웠고 저장에 동의한 사용자의 첫 화면에만 있었다. 사용자 결정: 이번엔 지우기만(지난 식단표 목록은 다음 묶음, 같은 대화 목록을 씀), 링크는 화면 아래 늘 보이게

- [x] **T15-1. 사용자별 대화 목록** (마이그레이션 0005 `conversations`, `GuardStore.recordConversation`·`conversationsOf`·`forgetConversations`, 계약 테스트): 한도 보호 미들웨어가 메시지 POST를 에이전트로 넘기기 직전에 기록. 막힌 요청·GET·abort는 기록하지 않음
- [x] **T15-2. 대화 DO 지우기**: Flue에 API가 없어 `agents/wipe-extension.ts`가 `extend({ base })`로 RPC 메서드 `wipeConversation`(Agent.destroy)을 더함(`diet-coach.ts`의 `cloudflare` export). `server/conversation-wipe.ts`가 목록의 대화를 지우고 지운 것만 목록에서 뺌, "destroyed" abort 에러는 성공. `app.ts`는 Flue와 같은 `getAgentByName`
- [x] **T15-3. `DELETE /api/profile`**: D1 프로필·식단표 + 대화, `{ failed }`
- [x] **T15-4. 화면**: `ForgetLink.tsx`(모든 화면 아래, 그 자리 확인, 끝나도 링크 유지), `forget-state.ts`, `deleteMyRecords`. 성공하면 브라우저 진행 값을 지우고 새 대화로. 첫 화면의 "저장한 내 정보 지우기"는 이 링크로 합침. 저장 동의 설명 문구 고침
- 확인: 테스트 767개(새 약 20개), 타입 검사, 빌드. 로컬 개발 서버(Neuron 0): 메시지 1개 보낸 대화의 DO에 Flue 테이블·메시지가 있음 → `DELETE` `{"failed":0}` → DO 테이블 없음, D1 `conversations` 0행. Chrome으로 링크 → 확인 → "모두 지웠어요." 확인
- 배포 순서: 원격 D1에 0005 적용 → 바로 `npm run deploy`(코드가 먼저 나가면 메시지 POST가 없는 테이블에 써서 500)

### T13. 생성 결과 품질 (B17)

gpt-oss-120b(low)로 바꾼 뒤 시간·통과율은 좋아졌지만 문장과 태그에 문제가 남았다(T8-7 3·4차, B16 배포본 확인)

- [x] **T13-1. 이유 문장 근거 오류** (프롬프트 고침 2026-11-08, **11-09 배포본 확인: 여전함**. 양념·장류를 열량 근거로, "된장 국물은 저염", "국물을 남기지 않아 열량을 줄이며" 등. 외식 칸 이유를 분류 이유·주문 팁으로 코드가 채우는 쪽을 후보로): gpt-oss가 틀린 근거를 쓴다("된장은 정제 탄수화물을 줄이는 데 도움"). 감량·LDL 목표에 일요일 저녁 삼겹살 구이처럼 규칙 안이지만 목표와 어긋난 이유도 있다. 프롬프트에 근거로 쓸 수 있는 것(기준, 태그)을 정해 준다
  - 결정(사용자, 11-09): 외식 칸 이유·근거 기준은 `finishCells`(`core/plan-cells.ts`)가 메뉴 분류의 이유·근거로 채운다. 주 1회 메뉴는 앞에 "이번 주 한 번만 넣었어요.", 분류 없음·빈 이유·"직접 정한 분류"면 모델 값. 프롬프트에 "외식 칸 reason은 짧게" 한 줄. 집밥 칸 이유는 그대로 모델(같은 오류가 남을 수 있음). 스펙 4.3 출력 정리
  - 확인: 테스트 836개(새 6개), 타입 검사, 빌드. 11-09 배포본 사용자 실행: 외식 14칸 모두 이유가 분류 이유와 같고 주 1회 메뉴는 앞 문장이 붙음([기록](experiments/2026-11-09-b22-deploy-user-run.md)). 집밥 칸 이유는 모델 문장 그대로
  - 결정: `sectionCellFormat` reason에 "이 칸의 재료와 주문 팁에서 확인되는 사실만 근거로, 외식에서 알 수 없는 조리 방식(저염 등) 금지, 양념·장류를 열량·탄수화물 근거로 쓰지 않기". `sectionRules`에 "집밥 메뉴는 식단 기준에 맞는 쪽"(포화지방 기준이 있으면 삼겹살·갈비 대신 살코기·생선 예시)
- [x] **T13-2. 외식 칸 주문 팁 빈 칸** (2026-11-08): gemma·gpt-oss 공통. `c2025ae`에서 표기("메뉴 → 팁")와 다른 메뉴 팁 옮기기 금지만 고쳤다
  - 결정: 코드로 보장. `core/plan-cells.ts`의 `finishCells`(`flue-plan-generator.ts`의 `normalizeCells`를 옮겨 키움)가 외식 칸 `orderTip`을 그 메뉴 분류의 `orderTips`(", "로 이음)로 채운다. 분류 팁이 모델 팁보다 우선, 분류에 팁이 없을 때만 모델 팁. 프롬프트는 "주문 팁에 없는 메뉴만" 쓰라고 바꿈. 생성·다시 추천(칸 수정) 모두
- [x] **T13-3. 제목에 주문 팁 괄호** (2026-11-08): "백반 (생선 반찬 고르기)"처럼 주문 팁 칸과 겹친다. 제목은 메뉴 이름만 ("나중에"에서 옮김)
  - 결정: 외식 칸 `title`은 `finishCells`가 정규화한 menuId로 정한다. 집밥 제목은 모델이 정한 이름이 곧 메뉴라 프롬프트로만("메뉴 이름만, 괄호 덧붙이지 않기"). 스펙 1.4 주석·menuId 규칙 고침
- [ ] **T13-4. 태그 누락** (프롬프트 고침 2026-11-08, **11-09 배포본 2회: `refined_carb_main` 정의대로**(흰쌀밥 없음, 샌드위치 있음). 흰 면 메뉴는 안 골라져 미확인. 재료 태그는 `egg`·`dairy`가 메뉴 구성에 따라 빠질 수 있음): 흰 식빵 칸에 `refined_carb_main` 누락(T8-7 3차). 결과로 열린 질문 3(LLM 태그를 믿을 수 있는지)을 판단한다
  - 11-09 배포본 사용자 실행: 쌀국수(흰 면)에는 붙음, **샌드위치 3칸에는 없음**(페르소나 E 2회차엔 붙음, 회차마다 다름). 김밥에 `wheat`, 생선 재료 가능성은 태그 없음. 이 프로필(콜레스테롤)은 이 태그로 걸리는 규칙이 없어 결과 영향 없음. 열린 질문 3 후보: 외식 메뉴 태그를 메뉴 분류 단계에서 한 번 정하게 하기
  - **B23 (2026-11-09, 되돌림):** 분류가 메뉴마다 tags를 정하고 외식 칸 태그를 코드가 채우게 했다(외식 칸 태그 = 분류 태그, 사전 점검에 태그 한도, 생성 프롬프트에 메뉴별 태그, 피할 음식 태그면 피하기, 분류 화면 "들어가는 것" 한 줄). 코드로는 동작했다(만들기 2회 통과, 어긋난 칸 0). 하지만 페르소나 E(메뉴 30개) 분류가 gemma는 4회 중 3회 3분 시간 초과, gpt-oss(low)는 통과해도 긴 JSON이 깨져 다시 묻기로 415~1,837 Neuron(태그 전 약 180). 확인에 약 5,700 Neuron을 썼다([기록](experiments/2026-11-09-b23-class-tags.md))
    - 결정(사용자): 분류 프롬프트에서 tags를 빼고 분류 모델은 gemma 그대로. 남긴 것: 분류 스키마가 쉼표로 이은 `criterionIds`·`tags`를 나눠 받음(gemma 재요청 원인), `tags`가 있으면 쓰는 코드(지금은 동작 안 함, `core/menu-tags.ts`·`plan-cells.ts`·`plan-feasibility.ts`·`plan-prompt.ts`·`ui/class-tags.ts`), 태그 설명 문장 `TAG_GUIDE`
    - 다음 후보: 메뉴를 나눠(예: 10개씩) 분류해 호출당 출력을 줄이기. 하려면 분류 시간 예산·예약량을 다시 본다
  - 결정: 프롬프트 태그 설명에 "refined_carb_main은 흰 면(국수, 라면, 우동, 파스타, 쌀국수 등)이나 흰 빵(식빵, 샌드위치, 토스트, 버거 등)이 주식인 메뉴, 흰쌀밥 제외". 키워드로 코드가 태그를 붙이는 보정은 통밀 샌드위치·메밀국수 같은 오탐이 있어 하지 않는다. 실제 확인에서 계속 빠지면 다시 정한다
- B17 확인(코드): 테스트 723개(새 11개), 타입 검사, 빌드. 실제 확인(0시 KST 이후): 로컬 평가 세트 페르소나 E 2회(약 1,000~1,500 Neuron)에서 이유 근거·외식 제목·`refined_carb_main`·집밥 선택을 사람이 보고, 배포(사용자 확인) 뒤 배포본 만들기 1회(약 500)

### T14. 다시 추천 비용 (B18)

- [x] **T14-1. 다시 추천이 생성 대화를 통째로 다시 보낸다** ("나중에"에서 옮김) (2026-11-08): 2026-11-08 배포본에서 다시 추천 입력 8,650토큰 = 생성 입력 2,012 + 출력 6,016 + 프롬프트. Flue 문서상 `harness.prompt`는 같은 도구 호출 안에서 대화를 이어 가고 끊는 옵션이 없다. gpt-oss 입력 단가로 다시 추천 1회에 약 200 Neuron이 더 든다. 후보: 다시 추천 전 `compact`, 생성 출력 줄이기
  - 조사: `harness.compact()`는 LLM 요약(Neuron·시간)이고 최근 8,000토큰(`keepRecentTokens`)은 그대로 둬 이 크기에선 거의 안 준다. 같은 도구 호출 안에서 새 harness 대화를 여는 API도 없다
  - 결정: 요청 본문에서 자른다. `output-caps.ts`의 `dropEarlierPrompts`를 `withOutputCaps`의 모든 모델 공통 보정으로(`provider.ts`). system·developer 메시지와 마지막 `FINISH_ONLY` user 메시지부터 끝까지만 남긴다. 도구 안 프롬프트가 하나뿐이면(생성, 칸 수정, 분류, 바깥 턴) 그대로. 모델별 보정(gpt-oss 문자열 content)은 그 뒤. CLAUDE.md에 표지 규칙 적음
  - 확인: 테스트 748개(새 8개), 타입 검사, 빌드. 일부러 다시 추천을 일으킬 수 없어 실제 효과(다시 추천 입력 약 8,650 → 2~3천)는 다음에 다시 추천이 나면 `stats.usages`·AI Gateway로 본다

### T12. 분류 확인 화면에서 무엇을 고치면 되는지 (B16, 2026-11-08)

B15 배포 뒤 사용자가 배포본에서 해 보니 분류 화면 맨 아래 "평일 저녁 외식 메뉴가 적어…"만 보이고, 어떤 메뉴가 평일 저녁 것인지, 무엇을 바꾸면 되는지 몰라 메뉴를 하나씩 건드려 봤다. 고칠 길도 "처음부터 다시"뿐이었다

결정(사용자, 2026-11-08 "제안대로"): 끼니별로 묶고 해결 방법을 그 자리에 보인다. 뒤로 가기는 "외식 메뉴 고치기"(지금 프로필을 채운 새 대화)로 하고, 다시 분류할 때 이전 분류를 재사용한다. 분류 화면에서 바로 메뉴 추가는 데이터 모양이 바뀌어 미룬다("나중에")

- [x] **T12-1. 해결 방법 계산** (2026-11-08, `core/plan-feasibility.ts`의 `mealGroups`·`fixSuggestions`): 끼니별 칸 수·쓸 수 있는 메뉴 수·모자람, 자주로 바꾸면 가능해지는 메뉴(주 1회·피하기 중), 메뉴를 하나 더 넣을 끼니
- [x] **T12-2. 분류 화면 묶음과 해결 방법** (2026-11-08, `ui/class-groups.ts`, `MenuClassView.tsx`): 점심·저녁에 같이 있는 메뉴는 두 묶음에 나오고 분류를 공유. 해결 방법의 분류 바꾸기는 누르면 바로 적용
- [x] **T12-3. 외식 메뉴 고치기** (2026-11-08, `ui/menu-edit.ts`, `App.tsx`): 새 대화에 인터뷰 진행(프로필 확인 화면부터)·일정·지금 분류(`carryClasses`, 분류가 끝나면 지움)를 넣는다. 저장에 동의했던 사람은 동의를 켠 채로. 메뉴 "고치기"는 이전 메뉴를 입력란에 미리 채운다(`FormProgress.prefill`, 하나만 더하려고 전부 다시 쓰지 않게)
- [x] **T12-4. 이전 분류 재사용** (2026-11-08, `plan-request.ts`의 `known`, `runClassification`): 같은 이름 메뉴는 이전 값, 새 메뉴만 모델로. 모두 있으면 모델 호출 없음
- [x] **배포본 확인 뒤 고침** (2026-11-08 오후): gpt-oss 첫 실제 만들기(13:52 KST)는 생성 57초에 통과했지만 수요일 점심 "포케볼"이 목록의 "포케볼(생선 x)"과 맞지 않아 다시 추천 1회(8초), 합계 약 800 Neuron. `normalizeMenuId`가 목록 쪽 괄호를 떼지 않던 버그를 고쳤다. 주문 팁도 "메뉴(팁)"를 "메뉴 → 팁"으로 바꾸고 다른 메뉴의 팁을 옮기지 말라고 적었다(평일 아침 5칸 모두에 견과류 팁이 붙었다)
- 확인: 테스트 711개, 타입 검사, 빌드. 로컬 개발 서버(데모 분류기, 페르소나 F 모양, 화요일 점심 일정)에서 브라우저로 끝까지: 두 끼니가 모자람으로 묶여 해결 방법이 보이고, "주먹밥을 자주로 바꾸기"를 누르면 경고가 사라지고 만들기가 풀림. "외식 메뉴 고치기" → 프로필 확인(일정·분류 이월) → 저녁에 쌀국수 추가 → 다시 분류에서 토스트의 주 1회(직접 정한 분류)가 유지되고 쌀국수만 새로 분류됨, 이월 분류는 지워짐

### T11. 불가능한 식단 조건 (B15, 2026-11-08)

배포본 사용자의 만들기 3번이 모두 실패한 실제 원인. AI Gateway 11-06 요청 본문(사용자 허락)을 보니 평일 점심 4칸에 외식 메뉴 2개(1개 주 1회), 평일 저녁 5칸에 3개(1개 주 1회, 1개는 점심과 같은 이름)였다. 같은 메뉴 주 2번, 주 1회 메뉴 1번, 바로 앞 끼니·같은 끼니 전날 같은 메뉴 금지를 함께 지키는 식단표가 없다. 모델은 불가능한 조건을 맞추려 출력 약 15,000토큰·5~6분을 썼다(T8-6의 원인을 "메뉴 많음"으로 본 것은 잘못)

결정(사용자, 2026-11-08): 메뉴가 적으면 같은 메뉴 허용 횟수를 자동으로 늘린다. 연속 금지와 주 1회 메뉴 제한은 풀지 않는다. 그래도 불가능하면 LLM을 부르기 전에 모자란 끼니를 안내한다. 손으로 확인하니 사용자 모양은 횟수를 늘려도 불가능하고, 평일 점심이나 저녁에 메뉴 하나만 더 있으면 가능하다

- [x] **T11-1. 사전 점검 `planFeasibility`** (core, 순수) (2026-11-08, `core/plan-feasibility.ts`, 칸 목록은 `core/plan-slots.ts`로 옮김): 외식 칸만, 시간순 백트래킹. 같은 메뉴 허용 횟수 2부터 올려 처음 가능한 값, 불가능이면 메뉴 하나 더하면 가능해지는 끼니(`shortMeals`)
- [x] **T11-2. 횟수 조정 반영** (2026-11-08, `menuWeeklyMaxFor`를 checkPlan·프롬프트·안내가 같이 씀, 데이터 모양 변경 없음): `checkPlan`의 `menu_weekly_limit`, 생성·다시 추천 프롬프트, 식단표 안내("외식 메뉴가 적어 같은 메뉴를 1주일에 N번까지 넣었어요.")
- [x] **T11-3. 만들기 전 차단** (2026-11-08): `create_week_plan`이 불가능이면 LLM 없이 `infeasible`, 화면은 다시 시도 없는 실패 화면
- [x] **T11-4. 화면 미리 알림** (2026-11-08, `classStepWarning`·`profileStepHint`): 메뉴 분류 확인 화면(분류·일정 반영, 불가능이면 버튼 막음), 프로필 확인 화면(모든 메뉴 often으로 낙관적 계산, 안내만)
- 픽스처: 페르소나 F(사용자 모양, 불가능), 페르소나 G(평일 점심 외식 메뉴 2개, 저녁 집밥, 주 3번이면 가능, 평가 세트에 넣음)
- 확인된 사실(테스트): 페르소나 A~E는 같은 메뉴 2번 그대로. F는 화요일 점심 일정이 있으면 평일 점심·저녁 중 한 곳, 일정이 없으면 평일 점심에 메뉴를 더해야 한다(점심 5일이 이어져 저녁을 늘려도 안 됨). G는 3번, 일정으로 점심 하루를 빼면 2번
- 확인: 테스트 678개, 타입 검사, 빌드. 실제 확인(2026-11-08, [기록](experiments/2026-11-08-b15-infeasible-profile.md)): F는 4초 만에 `infeasible`(식단 LLM 없음), G는 gemma 161초 첫 생성 통과·242 Neuron, 합계 약 323. 배포 버전 521bf1b0(2026-11-08)

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
| 3. LLM 태그를 믿을 수 있는지 | B17(T13-4) 결과를 보고. B23(분류에서 정하기)은 비용 때문에 되돌림, 메뉴 나눠 분류가 다음 후보 |

## 나중에


- 분류 확인 화면에서 바로 외식 메뉴 추가 (B16에서 미룸). 만들기 요청에 추가 메뉴를 싣고 서버가 검증해 프로필에 반영·새 버전 저장, 분류는 사용자가 고르거나 그 메뉴만 모델로. 지금은 "외식 메뉴 고치기"로 새 대화에서 한다

- 기다리는 화면의 "몇 칸을 다시 고르는 중" 안내 (스펙 7장). 도구 `log`는 대화에 안 나오므로 `useDataWriter` 같은 다른 통로가 필요하다. 지금까지 다시 추천 0회라 미뤘다
- 이 기능(T15, 0005) 전에 생긴 대화는 목록이 없어 "내 기록 모두 지우기"로 지울 수 없다. 필요하면 관리용으로 네임스페이스 전체 객체를 지우는 방법을 정한다(원격 사용자는 본인·확인용 토큰 2개뿐)
- 목표 메모 확인(llama-4-scout)이 "한 달에 2kg 정도 천천히"를 6회 중 1회 무리한 목표로 잘못 분류했다(B21 기록). 자주 보이면 프롬프트에 예시를 넣거나 모델을 바꾼다
- 가짜 모드 확인 중 만들기 응답이 2분 늦게 시작한 적이 있다(오류 없음). 다시 보이면 원인을 찾는다
- 메뉴 분류 품질: 국밥을 often으로 나눴고 이유가 "일반적인 식사라 식단 기준에 부합함"처럼 성의 없는 메뉴가 있다(B5 실제 1회). 프롬프트에서 메뉴마다 근거 기준과 주문 팁을 꼭 쓰게 하거나 gemma와 비교한다
- 2차 리뷰 낮음(T19, 남은 것): 토큰 만료·폐기·"이 기기에서 로그아웃", 인증 전 요청 속도 제한(WAF, 대시보드), 사용자당 대화 수 상한(지금은 하루 메시지 30회가 새 대화 수도 막는다). 보안 헤더·SRI·대화 ID 형식·지우기 경쟁·목록 순서는 B22
- 첫 시연 이후 기능: 하루 재조정, 레시피, 지난주 체크 반영, 근육 증가 목표, 도시락
