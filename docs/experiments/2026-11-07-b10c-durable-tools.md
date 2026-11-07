# B10c durable 도구 사전 조사 (2026-11-07)

B12(T8-3, 긴 LLM 호출 결과 유실 막기)를 할지, 한다면 범위를 정하려는 조사다. 이번에는 실제 모델을 부르지 않았다. 문서와 설치된 소스를 읽었고, 직접 확인하는 실험은 "남은 확인"에 방법을 적어 두었다(바깥 턴 실제 호출이 필요해 11-07 18시 이후로 미룸).

## 질문

- 11-06 배포본 2차 시도에서 생성이 4분 34초에 끝나기 직전 Durable Object가 재시작돼 도구가 `interrupted`로 끝나고 결과가 사라졌다(tasks.md T8). Flue `durable: true` 도구로 감싸면 다시 부르지 않고 이어 갈 수 있나
- 바꾸면 무엇이 달라지나: 재시작 뒤 다시 부르는 범위, 도구 결과·상태 저장 시점, 시간 제한과의 관계
- 재시작은 왜 났을까

## 방법

- 설치된 Flue 2.3.0 문서: `node_modules/@flue/runtime/docs/guide/durability.md`, `tools.md`("Durable tools", "Bounded tools"), `cloudflare-target.md`("Durable agent execution")
- 설치된 소스: `dist/types-B1PuLhZt.d.mts`(`ToolStep`, `ToolDefinition.durable`·`timeoutMs`), `dist/tool-ex5dfLTb.mjs`(step 이름 규칙), `dist/cloudflare/internal.mjs`, `dist/agent-coordinator-f9gHF-F5.mjs`(`startSubmissionAttempt`), Agents SDK `agents` 0.20.1 `runFiber`·`keepAlive`
- Cloudflare 문서: Durable Objects 한도(https://developers.cloudflare.com/durable-objects/platform/limits/)

## 비용

0 Neuron (문서·소스 읽기만)

## 결과

### 보통 도구가 끊기면

복구는 끊긴 보통 도구 호출을 **다시 실행하지 않는다.** 어떤 부수 효과가 이미 났는지 모르기 때문이다. 대신 "결과를 모름" 에러로 그 호출을 끝내고 모델이 그 에러를 본다(durability.md "Recovery after an interruption"). 11-06 2차의 `interrupted`가 이것이다.

- 우리 쪽 위험: 모델이 이 에러를 보고 같은 도구를 다시 부를 수 있다. 우리 원칙 "도구는 에러를 던지지 않는다"(CLAUDE.md)가 막으려던 것과 같은 모양이다. 식단 도구면 몇 분, 수백 Neuron이다. 실제로 다시 부르는지는 확인하지 않았다(남은 확인 2)

### `durable: true` 도구

- 복구 때 **호출 전체를 다시 실행**한다. 끝난 `step.do(name, fn)`은 기록한 값을 돌려주고 `fn`을 부르지 않는다. 끝나지 않은 첫 step부터 실제로 돈다(tools.md "Durable tools")
- `harness: true`와 함께 쓸 수 있다. 문서가 "`harness.prompt(...)`를 step으로 감싸 복구 때 다시 묻지 않게 하라"고 한다
- 규칙
  - 부수 효과는 모두 step 안에. **step 밖 코드는 복구 때 다시 돈다**
  - 이름은 결정적으로(무작위·시각 금지). 한 호출에서 같은 이름을 두 번 쓰면 throw(`tool-ex5dfLTb.mjs`의 `claimStepName`)
  - 값은 JSON, 작게
  - 기록은 정확히 한 번, 실행은 적어도 한 번: `fn`이 끝난 직후~기록 전에 죽으면 그 step이 한 번 더 돈다
- step 기록은 도구 호출 ID에 묶인다. 모델이 도구를 새로 부르면 step은 처음부터 돈다
- 도구가 던진 에러는 끊김이 아니라 보통 도구 에러다(자동 재시도 없음). 우리는 이미 던지지 않는다
- 배포로 도구가 없어지거나 `durable`이 빠지면, 복구는 보통 도구처럼 끊김 표시로 끝낸다

### 상태 저장 시점

`usePersistentState` 쓰기는 그 도구 배치와 함께 원자적으로 커밋된다. 복구가 배치를 끊김으로 끝내면 쓴 적이 없는 것이 된다(durability.md "Persisted state"). 그래서 `savePlan`, `saveClasses`(T9-2 이후 성공 때만)는 durable로 바꿔도 그대로 둬도 된다.

### 시간 제한

- 제출 하나의 한도: 기본 **10회 시도, 1시간**. 에이전트 static `durability = { maxAttempts, timeoutMs }`로 바꾼다. 마감 시각에는 시도의 abort signal을 쏜다
- 도구별 `timeoutMs`: 넘으면 `ToolTimeoutError`가 **모델이 보는 에러 결과**가 되고 대화가 이어진다 → 다시 부를 위험. 우리는 T8-4 루프 예산(만들기 10분, 칸 수정 5분)으로 먼저 끝내므로 `timeoutMs`는 넣더라도 예산보다 넉넉하게 둔다

### Cloudflare 실행 모델과 재시작 원인 후보

- Durable Object **알람 핸들러의 벽시계 한도는 15분**이다(Cloudflare 문서). HTTP·RPC는 연결이 있는 동안 제한이 없다
- Flue 문서(cloudflare-target.md)는 "알람 호출이 응답 전체(모든 턴과 도구)를 기다린다"고 한다. 설치된 소스 주석(`cloudflare/internal.mjs`의 `__flueWakeAgentSubmissions`)은 "시도 fiber를 떼어서 시작하고, fiber는 Agents SDK `runFiber` keepAlive·복구로 호출보다 오래 산다"고 한다. 그런데 `startSubmissionAttempt`는 "drain이 기다릴 promise"를 돌려준다. **알람 하나가 응답을 끝까지 기다리는지는 소스만으로 확실하지 않다**
- 만약 알람이 응답을 기다린다면 한 응답이 15분을 넘으면 잘린다. 11-06 기록(23:06 1차 시작 → 약 10분 뒤 시간 초과 → 바로 다시 시도 → 생성 4분 34초에 끝나기 직전 재시작)은 **첫 시작부터 약 15분**이다. 두 제출이 한 알람 호출 안에서 이어서 처리됐다면 맞아떨어진다. 가설이고 확인하지 않았다(남은 확인 3)
- 다른 후보: 배포, Workers 런타임 업데이트(기존 요청에 최대 20분 유예), 요청 사이 CPU 30초 초과(우리는 대부분 I/O 대기라 가능성 낮음)
- T8-4 이후 만들기 도구 예산은 10분이라, 바깥 턴을 더해도 제출 하나는 15분 아래다. 다만 "실패 → 바로 다시 시도"가 한 알람에 이어진다는 가설이 맞으면 두 제출 합이 15분을 넘을 수 있다

## 결론과 영향

- **B12는 하는 쪽을 제안한다.** 바꿀 곳이 식단 도구 두 개와 생성기를 감싸는 함수 하나로 작다. 재시작 빈도는 B11 실측 동안 B10 로그로 함께 본다
- B12 범위 초안
  - `create_week_plan`, `edit_plan_cells`에 `durable: true`
  - `PlanGenerator`를 감싸는 `steppedGenerator(gen, step)`: 호출마다 `step.do('llm:1')`, `'llm:2'`…로 `{ value, usage }`를 기록한다. 루프는 받은 값만으로 다음 호출을 정하므로 순번 이름이 결정적이다. 도구 안 사용량 기록(`metered`)도 step 안에서 일어나 복구 때 두 번 세지 않는다
  - `step.do('start', () => ({ planId, createdAt, startedAt }))`로 ID·시각·시간 예산 시작을 고정한다. 그러면 복구 뒤에도 T8-4 예산이 처음 시작 기준으로 이어진다(지금 `budget.now`는 `Date.now`라 복구 때 처음부터 다시 잰다)
  - D1 저장(`persistPlan`)은 `step.do('persist', …)`
  - 에이전트 `durability`를 줄인다(예: `maxAttempts: 3`, `timeoutMs: 20분`). 기본 10회·1시간이면 복구가 반복될 때 Neuron을 많이 쓴다
  - 끝나기 전에 죽은 생성 step은 처음부터 다시 부른다. 최악이면 그 호출 Neuron이 두 배다. 지금(결과를 버리고 사용자가 다시 시도)보다 나쁘지 않다
- 분류 도구(`classify_menus`, 약 95초)와 인터뷰 제출(4~6초)은 짧아 이번 범위에서 뺀다

## 남은 확인

11-07 18시 이후 B11을 시작할 때 함께 한다(로컬 개발 서버, 바깥 턴만 실제 모델, 약 20~40 Neuron).

1. **durable 동작**: 임시 브랜치에서 `create_week_plan`을 `durable: true` + `steppedGenerator`로 감싸고 데모 생성기 지연을 60초로 늘린다(`PLAN_GENERATOR=demo`). 만들기를 보내고 (a) 생성 step이 끝나기 전, (b) 끝난 뒤 다시 추천 전에 node(vite) → `workerd` 순서로 끄고 다시 띄운다. Durable Object 저장소(`flue_conversation_stream_batches`)에서 `tool_step_settled`, 생성기 호출 수(로그), 도구 결과가 이어지는지 본다. 데모 생성기는 다시 추천이 없으므로 (b)는 위반 칸을 넣은 가짜로 바꿔 본다
2. **보통 도구 끊김 뒤 바깥 모델**: 같은 방법으로 지금 도구(durable 아님)를 끊고, 복구 뒤 바깥 모델이 `create_week_plan`을 다시 부르는지 본다. 다시 부르면 B12 전까지 바깥 턴 지시문에 "끊김 에러여도 다시 부르지 말 것"을 더한다
3. **알람 15분 가설**: 배포본 Workers Logs(Durable Objects → FlueDietCoachAgent → Observability)에서 B11 실측 동안 alarm 호출의 시간과 끝난 이유(`outcome`)를 본다. 15분 근처에서 끊기면 Flue 이슈로 남기고, 다시 시도가 앞 제출과 이어지지 않게 막는 방법을 찾는다
