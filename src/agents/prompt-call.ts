// harness.prompt 호출 공용 (tasks.md B6). 시간 제한을 걸고, 에러를 core가 알아보는 모양으로 바꾼다.
// - 한도 초과 → QuotaExceededError (스펙 11.3-1)
// - 시간 초과 → LlmTimeoutError. Flue의 구조화 출력 재요청(최대 33턴)이 길게 도는 것을 끊는다
import type { PromptOptions } from '@flue/runtime';
import type * as v from 'valibot';
import { LlmTimeoutError } from '../core/llm-timeout.ts';
import { isQuotaExceeded, QuotaExceededError } from '../core/quota.ts';
import type { PromptHarness } from './flue-plan-generator.ts';

export async function promptWithLimit<S extends v.GenericSchema>(
  harness: PromptHarness,
  text: string,
  options: Omit<PromptOptions<S>, 'signal'> & { result: S },
  limitMs: number,
): Promise<unknown> {
  const signal = AbortSignal.timeout(limitMs);
  try {
    return await harness.prompt(text, { ...options, signal });
  } catch (error) {
    if (isQuotaExceeded(error)) throw new QuotaExceededError({ cause: error });
    if (signal.aborted) throw new LlmTimeoutError(limitMs, { cause: error });
    throw error;
  }
}
