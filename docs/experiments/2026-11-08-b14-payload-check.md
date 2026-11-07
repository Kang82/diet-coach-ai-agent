# B14 후보 모델 메시지 형식 사전 확인 (2026-11-08)

B14 1차([gpt-oss-120b low 1회](2026-11-08-b14-gpt-oss-low.md))에서 Workers AI gpt-oss-120b가 Flue의 두 번째 턴 메시지 형식을 400으로 거절했다. 식단 생성 비교 전에 (1) mistral-small도 같은 문제가 있는지, (2) gpt-oss 요청을 문자열 content로 맞추면 통하는지를 짧은 직접 호출로 확인했다.

## 방법

- Cloudflare 모델 스키마 API(무료)로 기본 출력 상한과 `messages` 스키마를 봤다
- 스크래치 스크립트: wrangler `getPlatformProxy`에 AI 바인딩만 있는 임시 설정, `env.AI.run(model, payload, { gateway: { id: 'default' } })`
- 페이로드는 1차 실험 게이트웨이 기록의 Flue 두 번째 턴 모양을 본뜬 작은 것: 시스템 문자열, 사용자 `content` 배열(텍스트 블록), 도구를 부른 assistant(`content: null` + `tool_calls`), tool 결과, `finish` 도구 하나, `max_completion_tokens` 200, gpt-oss는 `reasoning_effort: low`. "문자열" 모양은 배열을 텍스트로 합치고 `null`을 `""`로 바꾼 것

## 비용

호출 6번(성공 3번 약 22 Neuron, 400 3번 0토큰)

## 결과

스키마(기본 출력 상한): gemma·glm-4.7-flash 없음, gpt-oss-120b·mistral-small-3.1·llama-4-scout·granite-4.0-h-micro 256. gpt-oss-120b의 `messages[].content`는 문자열 또는 텍스트 배열이고 필수(`null` 불가). mistral-small은 문자열·배열·객체, `tool_call_id`는 "영숫자 9자"여야 한다.

| 모델 | 모양 | 결과 |
| --- | --- | --- |
| mistral-small-3.1 | Flue 모양 | 200, `finish({"answer": "1 더하기 1은 2입니다."})`, 6.7 Neuron |
| mistral-small-3.1 | 문자열 | 200, 같은 결과 |
| gpt-oss-120b | Flue 모양 | 400 `5006`: `Type mismatch of '/messages/2/content', 'string' not in 'null'` 등(1차와 같음) |
| gpt-oss-120b | 문자열 | 200, `finish({"answer": "2"})`, 8.2 Neuron |

- 처음 mistral 두 번은 스크립트의 가짜 도구 호출 ID(`call_1`)가 "영숫자 9자" 규칙에 걸려 400이었다. 실제 대화에서는 ID를 모델이 만들므로 ID만 `abc123XYZ`로 바꿔 다시 봤다
- mistral-small은 Flue 모양을 그대로 받는다. 보정은 필요 없고 출력 상한(256)만 넣으면 된다
- gpt-oss-120b는 문자열로 맞추면 두 번째 턴도 받고, 이번에는 지시대로 `finish`를 불렀다

## 결정과 반영 (같은 날, 코드)

- `src/agents/output-caps.ts`: 후보 모델마다 출력 상한을 적거나 `null`(상한 없음)을 명시하게 바꿨다(`satisfies Record<ModelId, number | null>`, 빠지면 타입 검사 실패). 256인 granite·mistral·llama-scout·gpt-oss는 16,384. gpt-oss-120b만 요청 본문을 문자열 content로 맞추는 `onPayload` 보정(`PAYLOAD_FIXES`). 표는 자기 키만 보고(`Object.hasOwn`) 숫자만 쓴다(보안 리뷰 반영)
- llama-4-scout(목표 메모 확인)도 이제 상한 16,384가 들어간다. 출력이 짧아(약 30토큰) 동작은 같다
- 도구 안 프롬프트 정리: 식단 생성·다시 추천·메뉴 분류 프롬프트 첫 줄에 "이 요청에서는 다른 도구를 부르지 말고 결과를 finish 도구로만 보내세요."(`core/plan-prompt.ts` `FINISH_ONLY`). 바깥 지시는 다시 "사용자 메시지가 `<접두어>`로 시작하면 … 부르세요"로 조건을 붙였다(`agents/agent-instructions.ts`). 도구 안 대화의 사용자 메시지는 접두어로 시작하지 않는다
- 실제 식단 생성으로는 아직 확인하지 않았다. 페르소나 E 비교(gemma, gpt-oss-120b, mistral-small) 때 함께 본다
