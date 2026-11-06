# 모델 비교: gemma와 glm (2026-11-04)

## 질문

Workers AI 무료 모델 중 무엇을 기본으로 쓸까. 한국어가 들어간 중첩 스키마를 Flue의 `finish` 도구로 받을 수 있나, 태그와 이유 문장의 품질은 어떤가, `thinkingLevel: 'off'`로 빠르게 만들 수 있나.

## 방법

- 로컬 개발 서버에서 임시 `probe_plan` 도구(`harness: true`)가 `harness.prompt(text, { result: 스키마 })`로 페르소나 A의 **월요일 점심·저녁 2칸**을 요청했다. 모델마다 1회.
- 대화 ID: `probe-1`(gemma 기본), `probe-2`(gemma `thinkingLevel: 'off'`), `probe-3`(glm 기본). `warmup`은 서버 준비용이라 기록이 없다.
- **실험 코드는 저장소에 없다.** 커밋하지 않은 임시 도구였다. 프롬프트 문장도 남아 있지 않다. 지금 다시 하려면 `create_week_plan`(`src/agents/create-plan-tool.ts`)의 `useModel`이나 `harness.prompt`의 `model` 옵션을 바꿔 돌린다.

## 비용

| 대화 | 모델 | 설정 | 걸린 시간 (도구) | 입력 / 출력 토큰 | Neuron |
| --- | --- | --- | --- | --- | --- |
| probe-1 | gemma | 기본 (thinking medium) | 70초 | 1,199 / 1,654 | 약 56 |
| probe-2 | gemma | `thinkingLevel: 'off'` | 107초 | 1,200 / 4,636 | 약 137 |
| probe-3 | glm | 기본 | 44초 | 5,051 / 2,492 | 약 118 |

합계 약 311 Neuron. Neuron은 `src/agents/models.ts`의 단가로 계산했다 (`src/agents/models.test.ts`가 이 값을 확인한다).

## 결과

원본: [data/2026-11-04-model-comparison.json](data/2026-11-04-model-comparison.json) (칸, 사용량, 걸린 시간)

- 세 실행 모두 스키마를 통과했고, 외식 칸의 `menuId`는 메뉴 목록 글자와 정확히 같았다.
- gemma: 메뉴 목록을 지키고, 태그가 정확하고, 이유 문장이 자연스러웠다.
- `thinkingLevel: 'off'`: 품질은 같았지만 오히려 더 느리고 출력 토큰이 3배 가까이 늘었다. 추론을 끄는 효과가 없었다.
- glm: 빠르지만 태그가 틀렸다. 회덮밥에 `meat`·`chicken`·`fried`, 닭볶음탕에 `fried`를 붙이고, 이유에 없는 재료(곱창)를 적었다. 입력 토큰이 4배인 것은 스키마 재요청이 여러 번 일어났기 때문으로 보인다.
- `usage.cost`는 Workers AI에서 항상 0이었다.

## 결론과 영향

- 기본 모델은 gemma (`src/agents/models.ts`의 `DEFAULT_MODEL`). glm은 후순위 (스펙 11.1, 11.5).
- `thinkingLevel`은 기본값(medium)을 쓴다.
- Neuron은 `usage.cost`가 아니라 토큰 수 × 단가로 직접 계산한다 (스펙 11.4, `src/core/neurons.ts`).
- 2칸에 1분이 넘어서, 1주일을 어떻게 나눠 만들지 따로 재기로 했다 → [1주일 생성 방식 A/B](2026-11-04-week-plan-a-vs-b.md)

## 남은 의문

- 모델마다 1회라 참고용이다. 평가 세트(스펙 8.5)로 두 모델을 다시 비교한다 (하루에 한 모델씩).
