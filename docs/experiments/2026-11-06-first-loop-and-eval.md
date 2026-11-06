# 실제 루프 첫 실행과 평가 세트 (2026-11-06)

## 질문

점검·다시 추천 루프(`createPlan`)와 Flue 어댑터가 실제 모델로 동작하나. 1주일 1회의 시간과 Neuron은 얼마인가. 평가 세트(`npm run evals`)가 개발 서버로 돌아가나. tasks.md T1-5, T1-6.

## 방법

- 코드: 커밋 `8eec9eb`(어댑터, 프롬프트, `create_week_plan` 도구), `1e346c8`(평가 세트)
- gemma, 페르소나 A, `thinkingLevel` 기본. 프롬프트는 `src/core/plan-prompt.ts`의 `buildGeneratePrompt`
- 1회차(T1-5): 개발 서버에 직접 보냈다. 대화 ID `t1-5-run1`

  ```bash
  npm run dev -- --port 5199
  # 본문은 UTF-8 파일로 (Git Bash에서 curl -d '한글'은 깨진다)
  printf '%s' '{"kind":"user","body":"식단표 만들어 줘"}' > msg.json
  curl -X POST http://localhost:5199/agents/diet-coach/t1-5-run1 \
    -H 'Content-Type: application/json; charset=utf-8' --data-binary @msg.json
  curl http://localhost:5199/agents/diet-coach/t1-5-run1   # 대화 읽기
  ```

- 2회차(T1-6): 평가 세트로 돌렸다.

  ```bash
  npm run dev -- --port 5199
  EVAL_RUNS=1 npm run evals -- -t 페르소나A
  ```

## 비용

| 회차 | 걸린 시간 (도구) | 입력 / 출력 토큰 | Neuron | 다시 추천 |
| --- | --- | --- | --- | --- |
| 1 (T1-5) | 4분 27초 | 1,939 / 8,507 | 약 250 | 0회 |
| 2 (T1-6) | 3분 51초 | 1,939 / 9,389 | 약 274 | 0회 |

합계 약 524 Neuron. 바깥 턴(모델이 도구를 고르는 턴)은 빠져 있다.

## 결과

원본: [data/2026-11-06-t1-5-first-loop.json](data/2026-11-06-t1-5-first-loop.json), [data/2026-11-06-t1-6-eval-persona-a.json](data/2026-11-06-t1-6-eval-persona-a.json) (도구 결과 전체: 식단표, 점검 요약, 사용량)

- 두 번 모두 처음 만든 식단표가 `checkPlan`을 통과해 다시 추천이 없었다.
- 메뉴 다양성이 좋았다. 1회차는 평일 점심 백반 2회(월·금) 외에는 모두 달랐고, 저녁 5번과 주말 4번이 모두 다른 메뉴였다.
- 출력 토큰이 A/B 실험의 B(6,226~6,974)보다 많은 8천~9천 대였다. 프롬프트에 칸 작성 방법과 규칙을 자세히 적어 추론이 길어진 것으로 보인다. 1회 예산은 약 250~280 Neuron으로 본다.
- 태그 오류가 보였다. 지금은 모두 규칙을 지나치게 엄격하게 지키는 쪽이라 위험하지는 않다.
  - 버섯 들깨탕에 `soy` (들깨는 콩이 아님)
  - 소고기 야채 볶음, 소고기 채소 전골에 `fatty_meat` 없음 (부위에 따라 다름)
  - 현미밥이 들어간 칸에 `refined_carb_main`
  - 백반에 `soy`
- 모델은 도구 입력 `weekStart`를 직접 계산해 넘겼다(`2026-11-09`).
- 한도 초과 에러는 나지 않았다.

### 만들면서 확인한 것

- 처음 프롬프트는 외식 메뉴 설명을 평일 점심 5칸마다 반복했다. 같은 설정의 끼니를 한 줄로 묶어 입력을 줄였다 (커밋 `8eec9eb`).
- Workers AI 바인딩은 Cloudflare 환경에만 있어서, 평가 세트를 in-process(`start()`)로 돌릴 수 없다. 개발 서버에 HTTP로 보낸다.
- Flue는 모델 에러 메시지에 `429`, `rate limit` 등이 있으면 일시적 에러로 보고 같은 턴을 다시 시도한다(`isRetryableModelError`). 한도 초과 에러가 이 모양이면 몇 번 더 시도한 뒤 실패한다.
- Windows에서 개발 서버를 끌 때 vite의 node 프로세스를 먼저 꺼야 한다. 그렇지 않으면 `workerd`를 꺼도 다시 뜬다.

## 결론과 영향

- T1-5, T1-6 완료. 1회 예산을 약 250~280 Neuron으로 고쳤다 (스펙 11.5, CLAUDE.md).
- 바깥 턴 사용량도 세는 방법을 정해야 한다 (tasks.md T2-2, 스펙 11.4-3).
- 태그 신뢰도는 페르소나 2~4 평가 결과를 모아 판단한다 (열린 질문 3, tasks.md T1-7).

## 남은 의문

- 한도 초과 에러의 실제 모양 (열린 질문 6)
- 실패한 호출의 부분 사용량(스키마 재요청으로 쓴 토큰)을 Flue 에러에서 얻을 수 있는지
- 바깥 턴은 얼마나 쓰나
