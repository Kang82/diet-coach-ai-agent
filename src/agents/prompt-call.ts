// harness.prompt 호출 공용 (tasks.md B6). 시간 제한을 걸고, 에러를 core가 알아보는 모양으로 바꾼다.
// - 한도 초과 → QuotaExceededError (스펙 11.3-1)
// - 시간 초과 → LlmTimeoutError. Flue의 구조화 출력 재요청(최대 33턴)이 길게 도는 것을 끊는다.
//   원인(무응답·예산·호출 상한)을 함께 싣는다 (B19)
import type { PromptOptions } from '@flue/runtime';
import type * as v from 'valibot';
import { LlmTimeoutError, timeoutReason, type StreamStats } from '../core/llm-timeout.ts';
import { isQuotaExceeded, QuotaExceededError } from '../core/quota.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { createWatch, runWatched, streamStats } from './stream-watch.ts';

export interface WatchOptions {
  /** 이 호출의 원래 상한. limitMs가 이보다 짧으면 도구 시간 예산이 줄인 호출이다 (시간 초과 원인 budget) */
  callMaxMs?: number;
  /** 무응답으로 볼 간격. 테스트용, 기본은 STALL_MS */
  stallMs?: number;
}

export async function promptWithLimit<S extends v.GenericSchema>(
  harness: PromptHarness,
  text: string,
  options: Omit<PromptOptions<S>, 'signal'> & { result: S },
  limitMs: number,
  watchOptions: WatchOptions = {},
): Promise<unknown> {
  return (await promptWatched(harness, text, options, limitMs, watchOptions)).response;
}

/**
 * promptWithLimit + Workers AI 응답 스트림 관찰 (B19, stream-watch.ts). 시간 초과면 관찰 결과로 원인
 * (stalled·budget·call_limit)을 정해 LlmTimeoutError에 싣는다. 성공하면 관찰 결과를 함께 돌려준다
 */
export async function promptWatched<S extends v.GenericSchema>(
  harness: PromptHarness,
  text: string,
  options: Omit<PromptOptions<S>, 'signal'> & { result: S },
  limitMs: number,
  watchOptions: WatchOptions = {},
): Promise<{ response: unknown; stream: StreamStats }> {
  const signal = AbortSignal.timeout(limitMs);
  const watch = createWatch();
  try {
    const response = await runWatched(watch, () => harness.prompt(text, { ...options, signal }));
    return { response, stream: streamStats(watch) };
  } catch (error) {
    if (isQuotaExceeded(error)) throw new QuotaExceededError({ cause: error });
    if (signal.aborted) {
      const stream = streamStats(watch);
      const byBudget = watchOptions.callMaxMs !== undefined && limitMs < watchOptions.callMaxMs;
      const reason = timeoutReason({ ...stream, byBudget, stallMs: watchOptions.stallMs });
      throw new LlmTimeoutError(limitMs, { cause: error, reason, stream });
    }
    throw error;
  }
}
