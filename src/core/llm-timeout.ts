// LLM 호출 시간 제한 (tasks.md B6). Flue는 구조화된 출력이 검증에 실패하면 최대 33턴까지 다시 요청한다.
// 모델이 계속 틀리면 몇 분씩 돌며 한도를 쓰므로, 어댑터(src/agents/prompt-call.ts)가 시간 제한을 걸고
// 넘으면 이 에러로 바꿔 던진다. 실험 기록: docs/experiments/2026-11-06-b6-end-to-end.md

export class LlmTimeoutError extends Error {
  constructor(readonly limitMs: number, options?: { cause?: unknown }) {
    super(`LLM 호출이 ${Math.round(limitMs / 1000)}초 안에 끝나지 않아 멈췄습니다.`, options);
    this.name = 'LlmTimeoutError';
  }
}

/** 사용자에게 보여 줄 안내 */
export const LLM_TIMEOUT_MESSAGE = '응답이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 시도해 주세요.';

/** 호출별 시간 제한 (ms). 측정값(스펙 11.5)의 2배쯤으로 둔다 */
export const LLM_TIME_LIMITS = {
  /** 목표 메모 확인: 4~6초 */
  goalNote: 60_000,
  /** 메뉴 분류: gemma 추론이 60초를 넘었다 (B6). llama-4-scout는 7초였지만 출력 256토큰에서 잘려 쓰지 않는다 */
  menuClass: 3 * 60_000,
  /** 1주일 식단 생성: 2~4.5분 */
  generatePlan: 8 * 60_000,
  /** 칸 다시 추천: 약 1분 */
  regenerateCells: 4 * 60_000,
} as const;
