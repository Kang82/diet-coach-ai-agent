// 스펙 11.3 한도 초과 처리.
// LLM 어댑터(src/agents)는 isQuotaExceeded로 판별한 에러를 QuotaExceededError로 바꿔 던지고,
// 루프는 QuotaExceededError를 받으면 재요청하지 않고 즉시 멈춘다.

export class QuotaExceededError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Workers AI 하루 무료 한도를 다 썼습니다.', options);
    this.name = 'QuotaExceededError';
  }
}

/** 사용자에게 보여 줄 안내 (스펙 11.3-3) */
export const QUOTA_EXCEEDED_MESSAGE = '오늘 사용할 수 있는 양을 다 썼어요. 오전 9시 이후에 이어서 할 수 있어요.';

// 임시 판별 (열린 질문 6). Workers AI 무료 한도 초과는 코드 4006,
// "you have used up your daily free allocation of 10,000 neurons" 문구로 알려져 있다.
// 실제 에러가 Flue를 거쳐 어떤 모양으로 오는지 보고 확정한다.
const QUOTA_PATTERNS = [/\b4006\b/, /daily free allocation/i];
const MAX_CAUSE_DEPTH = 5;

/** Workers AI 한도 초과 에러인지. Flue 등이 감싼 경우를 위해 cause를 따라간다. */
export function isQuotaExceeded(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current != null; depth++) {
    if (current instanceof QuotaExceededError) return true;
    const message = current instanceof Error ? current.message : typeof current === 'string' ? current : '';
    if (QUOTA_PATTERNS.some((p) => p.test(message))) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
