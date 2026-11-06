# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

식단 코치 에이전트. 인터뷰로 목표와 식사 환경을 받아 1주일 식단표를 만든다. Flue(에이전트 프레임워크) + Cloudflare Workers, LLM은 Workers AI 무료 모델.

- `docs/diet-coach-agent-screener.md`: 기획서 (무엇을 왜)
- `docs/diet-coach-spec.md`: 구현 스펙. **데이터 모양, 규칙, 테스트 케이스의 기준은 이 문서다.** 코드 주석의 "스펙 3장", "8.2" 같은 표기는 이 문서의 절을 가리킨다. 9장이 구현 순서, 10장이 열린 질문, 11장이 모델·사용량·배포 전 필수 항목이다.
- `docs/experiments/`: 실제 모델을 부른 실험 기록(방법, 비용, 원본 결과 `data/`). **실제 모델을 부르는 실험이나 측정을 하면 여기에 문서를 남기고 README 목록에 한 줄 더한다.** 결정으로 이어진 요약은 스펙 11.5에도 적는다. 같은 실험을 다시 돌리기 전에 먼저 확인한다.
- `docs/tasks.md`: 작업 목록. **"이어서 하자"고 하면 체크되지 않은 첫 task(선행이 끝난 것)가 속한 묶음("작업 묶음" 표)을 진행한다.** task를 끝내면 체크하고, 새로 생긴 일은 알맞은 자리에 추가한다.
- 문서, 주석, 커밋 메시지, 사용자 응대는 한국어로 쓴다.

## 작업 방식: 계획 먼저, 승인 후 구현

묶음을 시작할 때는 **코드를 고치기 전에 계획을 쓰고 사용자 승인을 받는다** (plan mode 사용). 계획에 넣을 것:

1. 바꿀 파일, 새로 만들 파일
2. 정해야 할 것 (데이터 모양, 열린 질문 등)과 제안
3. 테스트 목록: TDD로 확인할 케이스(스펙 8.2 등), 화면이면 무엇을 자동 테스트로 확인할지
4. 실제 모델 확인: 몇 번 부르는지, 대략 몇 Neuron·몇 분인지

- 승인 전에는 파일을 고치지 않는다. 읽기, 검색, `npm test`는 해도 된다.
- 진행 중 계획과 달라져야 하면 멈추고 무엇이 왜 바뀌는지 알린 뒤 다시 승인을 받는다.
- 계획에서 정한 결정은 `docs/tasks.md`의 해당 task(필요하면 스펙)에 남긴다.
- 오타 수정, 문서 한두 줄 같은 작은 일은 계획 없이 바로 한다.

## 명령

```bash
npm test                                   # 단위 테스트 (vitest run)
npx vitest run src/core/check-plan.test.ts # 파일 하나
npx vitest run -t "18. 같은 끼니"           # 이름으로 테스트 하나
npm run typecheck                          # tsc --noEmit
npm run build                              # vite build → Cloudflare Worker (dist/)
npm run dev                                # vite dev (workerd). AI 호출은 원격이라 `npx wrangler login` 필요
npm run evals -- -t 페르소나A              # 평가 세트 (스펙 8.5). 개발 서버(5199)를 먼저 띄운다. 1회 약 4분, 약 270 Neuron
```

- `vitest.config.ts`는 단위 테스트 전용이다. `vite.config.ts`의 Cloudflare 플러그인을 테스트에서 불러오지 않으려고 분리했다. LLM 평가 세트는 `vitest.evals.config.ts`(`src/evals/**/*.eval.ts`)로 따로 돈다. 기본 2회이고 `EVAL_RUNS=1`로 줄일 수 있다 (스펙 8.5).
- 화면 개발 중에는 `.dev.vars`에 `PLAN_GENERATOR=demo`를 넣으면 식단 생성이 실제 모델 대신 페르소나 A 칸을 5초 뒤 돌려준다(바깥 턴만 실제 호출, 약 2 Neuron). `.dev.vars`를 바꾸면 개발 서버를 다시 띄운다. 평가 세트와 실제 확인은 이 줄을 지우거나 주석 처리한다.
- `npm run deploy`는 스펙 11.4(토큰 확인, 사용자별 호출 제한, 전체 Neuron 안전선)가 구현되기 전에는 쓰지 않는다. Flue 에이전트 경로에는 인증이 없어서, 열어 두면 누구나 하루 무료 한도를 소진시킬 수 있다.

## 구조

```
src/core/     순수 로직. Flue·Cloudflare를 import하지 않는다.
src/storage/  Storage 인터페이스, 메모리 구현, 계약 테스트
src/agents/   Flue 에이전트 ('use agent'), 모델 ID (models.ts)
src/ui/       React 화면 (@flue/react). 화면 상태 판단은 순수 함수(plan-view-state.ts)로 두고 테스트한다
src/app.ts    Hono 라우트 맵. 에이전트를 마운트한다.
```

**처리 원칙: 결과를 보장해야 하는 일은 코드, 판단과 문장은 LLM.** 식단 기준 계산(`buildCriteria`), 규칙 점검(`checkPlan`), 요약 문구(`formatCheckSummary`), 저장은 코드다. LLM 출력은 `checkPlan`이 걸러 내고, 위반한 칸만 다시 추천하는 루프(스펙 4.4)를 돈다.

### core

- `types.ts`의 배열 상수(`RULE_IDS`, `CRITERION_IDS`, `AVOID_TAGS`, `DAYS` 등)는 **선언 순서가 곧 정렬 순서**다. 순서를 바꾸면 테스트 기대값이 깨진다.
- `checkPlan`은 순수 함수다. 위반은 `{ rule, cells, regenerate, detail? }`이고 `RULE_IDS` 순서 → 첫 칸 시간순 → detail 순으로 정렬된다. `cells`는 관련된 칸 전부, `regenerate`는 다시 추천할 칸(대개 허용 횟수를 넘긴 뒤쪽 칸)이다. 문구는 만들지 않고 `stats`만 돌려준다.
- 같은 메뉴 판정은 `menuKey()`(공백 제거)로 한다. 외식 메뉴 목록과 분류 비교는 정확히 일치로 한다.
- 규칙을 추가할 때: `RULE_IDS`에 위치를 정해 넣고, 스펙 3.2 표(판정·위반 단위·regenerate)와 8.2 테스트 표를 함께 고친다.
- LLM 호출은 `plan-generator.ts`의 `PlanGenerator` 포트 뒤에 둔다. 호출마다 `{ value, usage }`(토큰 사용량)를 돌려준다. 루프 테스트는 `__fixtures__/fake-plan-generator.ts`의 `FakePlanGenerator`에 응답(값, 에러, 함수)을 순서대로 정해 두고 `calls`로 호출 순서와 인자를 확인한다.
- `checkPlan` 테스트는 `__fixtures__/persona-a.ts`(통과하는 1주일 식단표)를 `structuredClone`해서 한 군데만 바꾸고, 기대한 위반 **목록 전체**를 `toEqual`로 비교한다. 기준 값은 `buildCriteria`가 아니라 고정값 `__fixtures__/rules-a.ts`를 쓴다.

### storage

새 `Storage` 구현(D1 등)은 `storageContract('이름', () => new 구현())` 한 줄로 `storage-contract.ts`의 계약 테스트를 통과해야 한다.

### Flue

- 설치된 Flue 문서가 `node_modules/@flue/runtime/docs/`에 있다. 웹 검색보다 이쪽이 설치 버전과 맞다.
- 에이전트를 추가하려면 세 가지가 필요하다: `'use agent'` 파일, `app.ts`의 `app.route(...)`, `wrangler.jsonc`의 Durable Object 마이그레이션(뒤에 덧붙이기만, 배포한 항목은 고치지 않음). 함수 이름이 곧 저장 식별자라서 이름을 바꾸면 마이그레이션이 필요하다.
- 구조화된 출력은 `harness.prompt(text, { result: valibot 스키마 })`로 받는다. 모델이 프레임워크의 `finish` 도구를 호출하고, 검증 실패 시 Flue가 다시 요청한다. 스키마는 zod가 아니라 valibot이다.
- Workers AI 모델에서는 `usage.cost`가 항상 0이다. Neuron은 토큰 수 × 모델별 단가로 직접 계산한다 (스펙 11.4).
- `package.json`의 `overrides`로 `@earendil-works/pi-ai`와 `pi-agent-core`를 1.4.0에 고정했다. 1.5.0은 Flue 2.3.0과 호환되지 않아 빌드가 깨진다. Flue를 올릴 때 이 고정을 풀 수 있는지 확인한다.

## Workers AI 무료 한도

- 하루 10,000 Neuron, 00:00 UTC(한국 오전 9시) 초기화. 넘으면 호출이 에러로 실패한다. **로컬 `vite dev`도 원격 호출이라 같은 한도를 쓴다.**
- 기본 모델은 `@cf/google/gemma-4-26b-a4b-it`(`src/agents/models.ts`). glm-4.7-flash는 태그 품질이 나빠 후순위다.
- 측정값(스펙 11.5): 1주일 14칸을 한 번에 만들면 약 4분, 약 250~280 Neuron. 2칸만 만들어도 1분 이상 걸린다. 실제 모델을 부르는 확인이나 평가는 사용량을 먼저 어림하고 돌린다.

## Windows 개발 환경 메모

- Git Bash에서 `curl -d '한글'`은 본문이 깨진다. UTF-8 파일로 만들어 `--data-binary @파일`로 보낸다.
- `vite dev`를 끝낼 때 node와 `workerd.exe` 프로세스가 남는다. 포트(예: 5199)를 쓰는 프로세스까지 종료한다. vite의 node 프로세스가 살아 있으면 `workerd`를 꺼도 다시 띄우므로 node(vite) → `workerd` 순서로 끈다.
- 개발 서버에서 식단표 만들기: `POST /agents/diet-coach/<id>`에 `{"kind":"user","body":"식단표 만들어 줘"}`를 보내고 `GET` 같은 주소로 대화를 읽는다. `create_week_plan` 도구 결과에 식단표가 남는다. 1회에 약 4분, 약 250 Neuron.
