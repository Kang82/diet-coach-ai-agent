# 식단 코치 에이전트

몇 가지 질문으로 목표(감량, 근육, 혈당·콜레스테롤 관리 등)와 끼니별 식사 환경(외식 메뉴, 요리 시간, 같이 먹는 사람)을 파악해 1주일 식단표를 만들어 주는 에이전트입니다.

- 에이전트 프레임워크: [Flue](https://www.npmjs.com/package/@flue/runtime)
- 실행 환경: Cloudflare Workers
- LLM: Workers AI 무료 모델 (`@cf/google/gemma-4-26b-a4b-it`)

> 개발 중입니다. 현재는 식단 기준 계산, 규칙 점검, 저장소 인터페이스까지 구현되어 있고, 식단표 생성 루프·화면·인터뷰는 아직입니다. 진행 상황은 [`docs/tasks.md`](docs/tasks.md)를 보세요.

## 설계 원칙

**결과를 보장해야 하는 일은 코드, 판단과 문장은 LLM.**

- 식단 기준 계산(`buildCriteria`), 규칙 점검(`checkPlan`), 요약 문구(`formatCheckSummary`), 저장은 코드로 처리합니다.
- LLM이 만든 식단표는 `checkPlan`이 걸러 내고, 규칙을 어긴 칸만 다시 추천받는 루프를 돕니다.

## 시작하기

Node.js가 필요합니다.

```bash
npm install
npm test            # 단위 테스트 (vitest)
npm run typecheck   # 타입 검사
npm run build       # Cloudflare Worker 빌드 (dist/)
```

로컬 개발 서버:

```bash
npx wrangler login  # Workers AI는 로컬에서도 원격 호출이라 로그인이 필요합니다
npm run dev
```

- `GET /api/ping`: 동작 확인
- `/agents/diet-coach`: Flue 에이전트 경로

### 사용량 주의

Workers AI 무료 한도는 하루 10,000 Neuron이고 00:00 UTC(한국 오전 9시)에 초기화됩니다. 로컬 `npm run dev`도 같은 한도를 씁니다. 1주일 식단표를 한 번 만들 때 약 200 Neuron, 3분 정도 걸립니다.

### 배포 전 확인

`npm run deploy`는 아직 쓰지 마세요. 에이전트 경로에 인증과 호출 제한이 없어서, 공개하면 누구나 하루 무료 한도를 소진시킬 수 있습니다. 사용자 토큰 확인, 사용자별 호출 제한, 전체 Neuron 안전선(스펙 11.4)을 먼저 구현해야 합니다.

## 구조

```
src/core/     순수 로직 (식단 기준, 규칙 점검, 요약 문구). Flue·Cloudflare에 의존하지 않음
src/storage/  Storage 인터페이스, 메모리 구현, 계약 테스트
src/agents/   Flue 에이전트와 모델 ID
src/app.ts    Hono 라우트. 에이전트를 마운트
docs/         기획서, 구현 스펙, 작업 목록
```

## 문서

| 문서 | 내용 |
| --- | --- |
| [`docs/diet-coach-agent-screener.md`](docs/diet-coach-agent-screener.md) | 기획서: 누구를 위해, 무엇을, 왜 |
| [`docs/diet-coach-spec.md`](docs/diet-coach-spec.md) | 구현 스펙: 데이터 모양, 규칙, 테스트 케이스의 기준 |
| [`docs/tasks.md`](docs/tasks.md) | 작업 목록과 진행 상황 |
| [`CLAUDE.md`](CLAUDE.md) | 개발 메모 (명령, 구조, 주의 사항) |

## 주의

이 에이전트는 일반적인 식단 지침을 따르며 의료 조언을 하지 않습니다. 질환이 있거나 약을 복용 중이라면 전문가와 상담하세요.
