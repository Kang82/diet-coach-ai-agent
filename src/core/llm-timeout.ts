// LLM 호출 시간 제한 (tasks.md B6). Flue는 구조화된 출력이 검증에 실패하면 최대 33턴까지 다시 요청한다.
// 모델이 계속 틀리면 몇 분씩 돌며 한도를 쓰므로, 어댑터(src/agents/prompt-call.ts)가 시간 제한을 걸고
// 넘으면 이 에러로 바꿔 던진다. 실험 기록: docs/experiments/2026-11-06-b6-end-to-end.md

/**
 * 시간 초과 원인 (B19, tasks.md T8-8). 11-08 배포본 실패는 모델이 300초 동안 한 바이트도 보내지 않은 경우였는데
 * 예전에는 "답을 길게 쓰다 시간을 넘긴 경우"와 같은 문구였다.
 * - stalled: 모델이 바이트를 보내지 않은 간격이 STALL_MS 이상 (Workers AI 일시 멈춤 등)
 * - budget: 도구 전체 시간 예산이 남지 않아 호출 상한이 줄어든 상태에서 넘김
 * - call_limit: 응답은 오는데 호출별 상한을 넘김 (출력이 길거나 Flue 재요청이 이어짐)
 */
export type TimeoutReason = 'stalled' | 'budget' | 'call_limit';

/**
 * Flue Workers AI 공급자의 무응답 재요청 간격(streamIdleTimeoutMs, 기본 5분) (T22-1, agents/provider.ts).
 * 바이트 없이 이만큼 지나면 Flue가 끊고 다시 묻는다. 11-09 gpt-oss 정상 생성의 최장 간격은 0.69초였다.
 * gemma(분류·바깥 턴)는 실측이 없어 넉넉하게 둔다
 */
export const STREAM_IDLE_MS = 90_000;

/**
 * 무응답으로 볼 간격. STREAM_IDLE_MS보다 짧게 둬야 Flue가 끊고 다시 물은 경우(간격 약 STREAM_IDLE_MS)도 잡는다.
 * 실측(usage.stream.maxGapMs)으로 다시 볼 값이다
 */
export const STALL_MS = 60_000;

/** 한 LLM 호출 동안 Workers AI 응답 스트림을 지켜본 결과 (agents/stream-watch.ts). 본문 내용은 보지 않고 시각만 잰다 */
export interface StreamStats {
  /** 바인딩 요청 수. Flue의 구조화 출력 재요청·무응답 재요청이 있으면 2 이상 */
  requests: number;
  /** 호출 시작부터 첫 바이트까지 (ms). 한 바이트도 안 왔으면 null */
  firstByteMs: number | null;
  /** 바이트 없이 지난 가장 긴 간격 (ms). 요청 시작부터 첫 바이트까지, 끝난 순간까지의 마지막 간격도 포함 */
  maxGapMs: number;
}

/** 판정 순서는 stalled → budget → call_limit. 관찰한 요청이 없으면(스트림을 못 봄) 무응답이라고 하지 않는다 */
export function timeoutReason(input: {
  requests: number;
  maxGapMs: number;
  byBudget: boolean;
  stallMs?: number;
}): TimeoutReason {
  if (input.requests > 0 && input.maxGapMs >= (input.stallMs ?? STALL_MS)) return 'stalled';
  return input.byBudget ? 'budget' : 'call_limit';
}

export class LlmTimeoutError extends Error {
  readonly reason?: TimeoutReason;
  readonly stream?: StreamStats;

  constructor(
    readonly limitMs: number,
    options?: { cause?: unknown; reason?: TimeoutReason; stream?: StreamStats },
  ) {
    super(`LLM 호출이 ${Math.round(limitMs / 1000)}초 안에 끝나지 않아 멈췄습니다.`, options);
    this.name = 'LlmTimeoutError';
    if (options?.reason) this.reason = options.reason;
    if (options?.stream) this.stream = options.stream;
  }
}

/** 사용자에게 보여 줄 안내 (원인을 모를 때와 call_limit) */
export const LLM_TIMEOUT_MESSAGE = '응답이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 시도해 주세요.';

/** 원인별 안내 (B19). 화면은 도구 결과의 message를 그대로 보여 준다 */
export const TIMEOUT_MESSAGES: Record<TimeoutReason, string> = {
  stalled: 'AI 모델이 응답하지 않아 멈췄어요. 모델 서비스가 잠시 불안정할 수 있어요. 잠시 뒤 다시 시도해 주세요.',
  budget: '정해 둔 시간 안에 끝내지 못해 멈췄어요. 잠시 뒤 다시 시도해 주세요.',
  call_limit: LLM_TIMEOUT_MESSAGE,
};

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

/**
 * 제출(메시지) 하나의 복구 한도 (B12, Flue `durability` static). Flue 기본은 10회·1시간이라 복구가 되풀이되면 Neuron을 많이 쓴다.
 * 만들기 예산 10분(PLAN_TOOL_BUDGETS) + 바깥 턴 + 복구 한두 번 여유로 20분. durable 식단 도구는 예산을 처음 시작 시각부터 재므로
 * 복구가 있어도 도구는 대개 10분 안에 끝난다. 20분을 넘으면 Flue가 제출을 실패로 끝낸다(마지막 안전장치)
 */
export const SUBMISSION_DURABILITY = {
  maxAttempts: 3,
  timeoutMs: 20 * 60_000,
} as const;
