// harness.prompt 시간 제한과 에러 변환 (tasks.md B6)
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { LlmTimeoutError } from '../core/llm-timeout.ts';
import { QuotaExceededError } from '../core/quota.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { promptWatched, promptWithLimit } from './prompt-call.ts';
import { watchBinding } from './stream-watch.ts';

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

/**
 * Flue처럼 prompt 안에서 (감싼) 바인딩을 부르고 본문을 읽는 가짜 (B19).
 * chunkEveryMs마다 청크를 보내고 count개 뒤 끝낸다. count가 없으면 끝나지 않는다. silent면 한 바이트도 안 보낸다
 */
function streamingHarness(opts: { chunkEveryMs?: number; count?: number; silent?: boolean }) {
  const binding = watchBinding({
    run: async (..._args: unknown[]) => {
      let timer: ReturnType<typeof setInterval> | undefined;
      let sent = 0;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (opts.silent) return;
          timer = setInterval(() => {
            controller.enqueue(new Uint8Array([1]));
            sent += 1;
            if (opts.count !== undefined && sent >= opts.count) {
              clearInterval(timer);
              controller.close();
            }
          }, opts.chunkEveryMs ?? 5);
        },
        cancel() {
          clearInterval(timer);
        },
      });
      return new Response(body);
    },
  });
  const harness = {
    prompt: (async (_text: string, options: { signal?: AbortSignal }) => {
      const res = (await binding.run('@cf/m', {})) as Response;
      const reader = res.body!.getReader();
      const aborted = new Promise<never>((_, reject) =>
        options.signal?.addEventListener('abort', () => {
          void reader.cancel();
          reject(new Error('Request was aborted'));
        }),
      );
      for (;;) {
        const { done } = await Promise.race([reader.read(), aborted]);
        // cancel()이 기다리던 read를 done으로 끝낼 수 있어 끊겼는지 먼저 본다 (Flue도 abort면 에러로 끝남)
        if (options.signal?.aborted) throw new Error('Request was aborted');
        if (done) return { data: { ok: true } };
      }
    }) as unknown as PromptHarness['prompt'],
  };
  return harness;
}

describe('promptWatched: 시간 초과 원인 (B19)', () => {
  it('바이트가 오지 않은 채 시간이 다 되면 stalled', async () => {
    const error = await promptWatched(streamingHarness({ silent: true }), 'x', { result: schema }, 120, { stallMs: 60 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LlmTimeoutError);
    expect((error as LlmTimeoutError).reason).toBe('stalled');
    expect((error as LlmTimeoutError).stream).toMatchObject({ requests: 1, firstByteMs: null });
  });

  it('응답은 계속 오는데 상한을 넘기면 call_limit, 상한이 예산으로 줄었으면 budget', async () => {
    const callLimitError = await promptWatched(streamingHarness({ chunkEveryMs: 5 }), 'x', { result: schema }, 120, {
      stallMs: 80,
    }).catch((e: unknown) => e);
    expect((callLimitError as LlmTimeoutError).reason).toBe('call_limit');

    const budgetError = await promptWatched(streamingHarness({ chunkEveryMs: 5 }), 'x', { result: schema }, 120, {
      stallMs: 80,
      callMaxMs: 480_000,
    }).catch((e: unknown) => e);
    expect((budgetError as LlmTimeoutError).reason).toBe('budget');
  });

  it('성공하면 응답과 스트림 관찰 결과를 함께 돌려준다', async () => {
    const out = await promptWatched(streamingHarness({ chunkEveryMs: 5, count: 3 }), 'x', { result: schema }, 1_000);
    expect(out.response).toEqual({ data: { ok: true } });
    expect(out.stream.requests).toBe(1);
    expect(out.stream.firstByteMs).not.toBeNull();
  });

  it('바인딩을 거치지 않은 시간 초과(관찰 없음)는 stalled라고 하지 않는다', async () => {
    const { harness } = hangingHarness();
    const error = await promptWatched(harness, 'x', { result: schema }, 50, { stallMs: 10 }).catch((e: unknown) => e);
    expect((error as LlmTimeoutError).reason).toBe('call_limit');
  });
});
