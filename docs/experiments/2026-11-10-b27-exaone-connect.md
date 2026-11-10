# B27 K-EXAONE 2.5 연결 실험 (2026-11-10)

K-EXAONE 2.5(LG AI연구원, OpenAI 호환 API, 750B·활성 31B, 추론 항상 켜짐)를 식단 생성 후보로 붙일 수 있는지 앱 코드를 바꾸기 전에 직접 호출로 확인했다. 확인할 것: 도구 호출(Flue 구조화 출력은 `finish` 도구), Flue 두 번째 턴 메시지 형식, 스트리밍 무응답 간격, 1주일 식단 규모의 시간과 토큰.

## 방법

- 스크래치 스크립트(Node `--experimental-strip-types`)로 `POST https://api.exaone.ai/v1/chat/completions`, 모델 `k-exaone_v2.5`. 키는 `.dev.vars`의 `EXAONE_API_KEY`(출력·저장 안 함)
- 1: 짧은 질문, `reasoning_effort: "low"`, `max_tokens` 512
- 2: `finish({answer})` 도구 하나, 시스템 지시 "finish로만"
- 3: [B14 형식 확인](2026-11-08-b14-payload-check.md)과 같은 Flue 두 번째 턴 모양(사용자 content 배열, assistant `content: null` + `tool_calls`, tool 결과)
- 5: 2를 스트리밍으로(`stream_options.include_usage`, `chat_template_kwargs.preserve_thinking: true`), 조각 사이 최대 간격 측정
- 6: 페르소나 A 실제 식단 생성 프롬프트(`buildGeneratePrompt`, 1,661 입력 토큰) + `PlanCellsResultSchema`를 JSON 스키마로 바꾼 `finish` 도구, low, 스트리밍, `max_tokens` 16,384(gpt-oss와 같은 상한)
- 4(3이 400일 때 문자열 형식)와 7(6을 high로)은 하지 않았다. 아래 결과 참고

## 비용

EXAONE 호출 5회(하루 100회 중). Workers AI Neuron 0. 응답 헤더의 한도: `x-day-rate-limit: 100`, `x-minute-rate-limit: 60`, `x-second-rate-limit: 1`(사용자가 알려 준 값과 같음). 가격은 문서에 없다.

## 결과

원본: `data/2026-11-10-b27-exaone-{1,2,3,5,6-low}.json`

| # | 확인 | 결과 |
| --- | --- | --- |
| 1 | 기본 응답 | 200, 3.0초. "김치, 돼지고기, 두부". 출력 83토큰 중 추론 76. 추론은 영어로 한다. 답 앞에 `\n\n` |
| 2 | 도구 호출 | 200, 2.2초. `finish({"answer": "2"})`, `finish_reason: tool_calls`. content에도 답 문장을 같이 냈다 |
| 3 | Flue 두 번째 턴 형식 | 200, 1.9초. 그대로 받고 `finish` 호출. gpt-oss와 달리 `PAYLOAD_FIXES` 보정 필요 없음 → 4 생략 |
| 5 | 스트리밍 | 200, 첫 바이트 0.3초, 전체 2.0초, 조각 19개, 최대 간격 0.45초. 추론이 `reasoning_content` 조각으로 오고 도구 인자는 합치면 유효한 JSON |
| 6 | 페르소나 A 1주일(14칸), low | **실패.** 623초(10분 24초). 출력 16,384토큰에서 잘림(`finish_reason: length`), 그중 **추론 15,051토큰**. `finish` 이름만 나오고 인자는 빈 문자열. 첫 바이트 0.5초, 조각 사이 최대 22.9초. 출력 속도 약 26토큰/초 |

- 6의 추론 앞부분은 칸 수, 끼니 설정, 피할 음식을 차례로 따지는 내용이다. low인데도 추론이 끝나지 않았다. 1·2처럼 짧은 일에서는 추론이 짧아 low가 먹는 것처럼 보였다
- 비교: gpt-oss-120b(low)는 메뉴가 더 많은 페르소나 E에서도 27~72초에 첫 생성이 규칙을 통과했다([B14 비교](2026-11-08-b14-compare.md)). gemma는 2~6분
- 7(high)은 추론이 더 길어질 뿐이라 의미가 없어 돌리지 않았다

## 결론과 영향

- **연결 자체는 문제없다.** OpenAI 호환 공급자로 붙이면 Flue의 `finish` 도구 방식, 두 번째 턴 형식, 스트리밍이 보정 없이 동작한다
- **식단 생성(14칸 한 번에)에는 쓸 수 없다.** 만들기 도구 예산 10분을 한 번의 호출로 넘기고도 결과가 없다. 상한을 올려도 26토큰/초로는 추론 15,000토큰에만 약 10분이다. 조각 간격 22.9초는 무응답 제한(90초) 안이다
- 하루 100회, 초당 1회 한도도 Flue 재요청·다시 추천과 여러 사용자를 생각하면 빠듯하다
- 결정: **식단 생성 후보로 넣지 않는다**(T27-2 보류). 모델 배치는 그대로(`src/agents/models.ts`). 앱 코드 변경 없음

## 남은 의문

- 출력이 짧은 일(목표 메모 확인, 메뉴 분류)에서는 빠를 수 있다. 다만 지금 모델(llama-4-scout 5초 안팎, gemma)로 문제가 없고, 건강 정보가 외부 회사로 나가며, 하루 100회 한도가 있어 시도하지 않았다
- 요일별로 나눠 부르면(호출당 2칸) 시간이 줄 수 있지만 [1주일 생성 방식 A/B](2026-11-04-week-plan-a-vs-b.md)에서 버린 방식이고, 호출 수가 7배라 하루 100회 한도와 맞지 않는다
