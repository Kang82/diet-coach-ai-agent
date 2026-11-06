// harness.prompt 시간 제한과 에러 변환 (tasks.md B6)
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { LlmTimeoutError } from '../core/llm-timeout.ts';
import { QuotaExceededError } from '../core/quota.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { promptWithLimit } from './prompt-call.ts';

const schema = v.object({ ok: v.boolean() });

/** signal이 끊길 때까지 기다리다 Flue처럼 abort 에러로 끝나는 가짜 */
function hangingHarness() {
  const seen: { signal?: AbortSignal }[] = [];
  const harness = {
    prompt: ((_text: string, options: { signal?: AbortSignal }) => {
      seen.push(options);
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('Submission was aborted.')));
      });
    }) as unknown as PromptHarness['prompt'],
  };
  return { harness, seen };
}

describe('promptWithLimit', () => {
  it('시간 제한을 넘기면 LlmTimeoutError', async () => {
    const { harness, seen } = hangingHarness();
    await expect(promptWithLimit(harness, '분류', { result: schema }, 20)).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('한도 초과는 QuotaExceededError, 그 밖의 에러는 그대로', async () => {
    const failing = (error: Error) => ({
      prompt: (async () => {
        throw error;
      }) as unknown as PromptHarness['prompt'],
    });
    await expect(
      promptWithLimit(failing(new Error('4006: daily free allocation')), 'x', { result: schema }, 1_000),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(promptWithLimit(failing(new Error('boom')), 'x', { result: schema }, 1_000)).rejects.toThrow('boom');
  });
});
