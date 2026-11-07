# B12 식단 도구 durable 확인 (2026-11-08)

B12(T8-3)에서 `create_week_plan`, `edit_plan_cells`를 Flue durable 도구로 바꾼 뒤, Durable Object가 재시작돼도 끝난 step을 다시 돌지 않고 결과가 남는지, 시간 예산이 처음 시작부터 이어지는지 로컬에서 확인했다. 방법은 B10c 실험([기록](2026-11-07-b10c-durable-tools.md))과 같다.

## 질문

- 만들기·칸 수정 도중 재시작되면 `start` step은 기록값으로 돌아오고 끊긴 `llm:1`만 다시 도나
- 도구 `stats.seconds`와 예산이 처음 시작 시각부터 이어지나(B10c 실험에서는 60초로 다시 쟀다)
- `persist` step과 도구 결과가 복구 시도에서 남나

## 방법

- 커밋한 B12 코드 + 임시 변경(되돌림): `.dev.vars`에 `PLAN_GENERATOR=demo`, `MENU_CLASSIFIER=demo`, `DEMO_DELAY_MS=60000`, `pickGenerator`가 이 지연을 데모 생성기에 넘기게 한 줄
- 로컬 개발 서버(5199), 로컬 토큰 새로 발급. 페르소나 A로 인터뷰·분류를 채운 대화 1개(`src/evals/support/prepare.ts`)
- (a) `식단표 만들기:`를 보내고 약 45초 뒤(`start` 끝, `llm:1` 60초 대기 중) vite node → `workerd`를 강제 종료하고 다시 띄움
- (b) 같은 대화에 `칸 다시 추천:`(화요일 점심)을 보내고 약 50초 뒤 같은 방법으로 끊음
- Durable Object 저장소(`flue_conversation_stream_batches`)에서 `tool_step_settled` 기록의 시각과 시도(attemptId)를 봄

## 비용

바깥 턴만 실제 모델. 대화 1개에 메시지 4개(인터뷰 제출, 분류, 만들기, 칸 수정). 약 10 Neuron 이하로 어림(로컬 카운터 확인 안 함).

## 결과

| 경우 | 시도 1 (끊기기 전) | 시도 2 (복구) | 도구 결과 |
| --- | --- | --- | --- |
| (a) 만들기 | `start` 00:48:22 (planId `1ebe04aa…`) | `llm:1` 00:50:26, `persist` 00:50:26(값 false: 동의 프로필 없음) | `ok`, planId 같음, `stats.seconds` 124 |
| (b) 칸 수정 | `start` 00:50:56 (`startedAt`) | `llm:1` 00:53:04, `persist` 00:53:04 | `ok`, `regenerations` 1, `stats.seconds` 127 |

- 두 경우 모두 서버가 다시 뜨자 대화를 읽지 않아도 새 시도가 시작됐고, `start`는 다시 기록되지 않았다(기록 1개). 끊긴 `llm:1`만 처음부터 다시 돌았다(서버 재기동 뒤 약 60초)
- `stats.seconds`가 메시지를 보낸 시각부터 끝까지의 시간(124초, 127초)이다. B10c 실험의 60초와 달리 처음 시작 시각부터 잰다. 예산(`TimeBudget.startedAt`)도 같은 값을 쓴다
- 도구 호출은 만들기 1번, 칸 수정 1번뿐이다. 바깥 모델이 도구를 다시 부르지 않았다

## 결론

- B12 범위대로 동작한다. 배포본에서 11-06 2차처럼 생성이 끝나기 직전 재시작돼도, 끝난 호출의 결과는 남고 끊긴 호출 하나만 다시 든다
- 실제 `harness.prompt`를 step 안에서 끊는 경우는 확인하지 않았다(데모 생성기는 harness를 부르지 않음). 배포본 실제 1회는 정상 경로 확인용이다
- 강제 종료 중 PowerShell로 node 전체를 끄는 명령은 막혔다. 개발 서버 PID(명령줄에 프로젝트 경로가 있는 node·workerd)만 골라 끄면 된다
