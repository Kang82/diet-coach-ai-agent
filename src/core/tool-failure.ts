// 도구 실패 분류 (B5·B6 리뷰 1번). 도구 안에서 에러를 던지면 Flue가 바깥 모델에게 에러 결과로 보여 주고,
// 모델이 같은 도구를 다시 부를 수 있다(식단 생성이면 몇 분, 수백 Neuron). 그래서 도구는 던지지 않고
// 이 분류에 따라 결과(status)로 답하고 턴을 끝낸다.
import { LlmTimeoutError, LLM_TIMEOUT_MESSAGE, TIMEOUT_MESSAGES } from './llm-timeout.ts';
import { QUOTA_EXCEEDED_MESSAGE, QuotaExceededError } from './quota.ts';

export type FailureKind = 'timeout' | 'quota' | 'error';

const MAX_CAUSE_DEPTH = 5;

/** 감싼 에러(PlanLoopError 등)는 cause를 따라간다 */
export function failureKind(error: unknown): FailureKind {
  const found = findFailure(error);
  if (found instanceof LlmTimeoutError) return 'timeout';
  if (found instanceof QuotaExceededError) return 'quota';
  return 'error';
}

/** cause 사슬에서 처음 만난 LlmTimeoutError·QuotaExceededError */
function findFailure(error: unknown): LlmTimeoutError | QuotaExceededError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current != null; depth++) {
    if (current instanceof LlmTimeoutError || current instanceof QuotaExceededError) return current;
    current = typeof current === 'object' ? (current as { cause?: unknown }).cause : undefined;
  }
  return undefined;
}

/** 시간 초과 에러의 원인과 스트림 관찰 결과. 로그용 (B19) */
export function timeoutDetail(error: unknown): Pick<LlmTimeoutError, 'reason' | 'stream'> {
  const found = findFailure(error);
  return found instanceof LlmTimeoutError ? { reason: found.reason, stream: found.stream } : {};
}

export const TOOL_ERROR_MESSAGE = '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

/** error를 주면 시간 초과는 원인(stalled·budget·call_limit)에 맞는 문구를 고른다 (B19) */
export function failureMessage(kind: FailureKind, error?: unknown): string {
  switch (kind) {
    case 'timeout': {
      const reason = timeoutDetail(error).reason;
      return reason ? TIMEOUT_MESSAGES[reason] : LLM_TIMEOUT_MESSAGE;
    }
    case 'quota':
      return QUOTA_EXCEEDED_MESSAGE;
    case 'error':
      return TOOL_ERROR_MESSAGE;
  }
}
