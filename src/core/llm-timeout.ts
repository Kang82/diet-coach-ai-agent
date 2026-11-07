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

/**
 * 식단 도구 전체 시간 예산 (ms, tasks.md T8-4). 호출별 제한만으로는 생성 8분 + 다시 추천 4분 × 3회로 20분 가까이 걸릴 수 있다.
 * 루프가 남은 시간을 각 호출 제한으로 넘기고, 남은 시간이 MIN_REGENERATE_MS보다 적으면 다시 추천을 멈춘다.
 * 값은 11-06 배포본 지연(생성 5분 46초) 기준이다. B11(2026-11-07) 평가 세트 16회의 도구 시간은 113~354초(다시 추천 1회 포함)로 이 안에 든다.
 */
export const PLAN_TOOL_BUDGETS = {
  createPlan: 10 * 60_000,
  editPlanCells: 5 * 60_000,
} as const;

/**
 * 다시 추천을 새로 시작하는 데 필요한 남은 시간. 칸 하나 다시 추천 실측 약 1분이지만 2칸도 1분을 넘고,
 * 11-06에는 4칸이 4분을 넘겼다 (스펙 11.5, T8). 1분이면 시작해도 대개 못 끝내 Neuron만 써서 2분으로 둔다(배포 전 코드 리뷰 2번).
 * B11 16회 중 다시 추천은 1회(출력 4,800토큰)뿐이라 판단할 자료가 없어 그대로 둔다
 */
export const MIN_REGENERATE_MS = 2 * 60_000;

/** 호출별 상한과 루프가 넘긴 남은 시간 중 짧은 쪽 */
export function callLimit(callMaxMs: number, limitMs: number | undefined): number {
  return limitMs === undefined ? callMaxMs : Math.max(0, Math.min(callMaxMs, limitMs));
}
