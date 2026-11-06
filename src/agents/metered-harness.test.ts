// 도구 안 LLM 호출의 Neuron 기록 (스펙 11.4-3, B5·B6 리뷰 6번)
import { describe, expect, it } from 'vitest';
import { FAILED_CALL_NEURONS_PER_SECOND } from '../core/guard.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { meteredHarness } from './metered-harness.ts';
import { MODEL_CANDIDATES, NEURON_PRICES } from './models.ts';

const [provider, ...idParts] = MODEL_CANDIDATES.gemma.split('/');
const gemmaResponse = {
  data: { ok: true },
  usage: { input: 1_000_000, output: 1_000_000 },
  model: { provider, id: idParts.join('/') },
};

function harnessOf(prompt: () => Promise<unknown>): PromptHarness {
  return { prompt: prompt as unknown as PromptHarness['prompt'] };
}

function recorder() {
  const added: number[] = [];
  return { added, meter: { add: async (n: number) => void added.push(n) } };
}

describe('meteredHarness', () => {
  it('성공하면 토큰 × 모델 단가를 기록하고 응답을 그대로 돌려준다', async () => {
    const { added, meter } = recorder();
    const h = meteredHarness(harnessOf(async () => gemmaResponse), meter);
    expect(await h.prompt('x', {} as never)).toBe(gemmaResponse);
    const price = NEURON_PRICES[MODEL_CANDIDATES.gemma];
    expect(added).toEqual([price.inputPerM + price.outputPerM]);
  });

  it('모르는 모델은 가장 비싼 단가로 센다', async () => {
    const { added, meter } = recorder();
    const unknown = { ...gemmaResponse, model: { provider: 'cloudflare', id: '@cf/unknown' } };
    await meteredHarness(harnessOf(async () => unknown), meter).prompt('x', {} as never);
    const prices = Object.values(NEURON_PRICES);
    expect(added).toEqual([
      Math.max(...prices.map((p) => p.inputPerM)) + Math.max(...prices.map((p) => p.outputPerM)),
    ]);
  });

  it('실패하면 걸린 초 × 보수적 단가를 기록하고 에러를 그대로 던진다', async () => {
    const { added, meter } = recorder();
    let t = 0;
    const error = new Error('시간 초과');
    const h = meteredHarness(
      harnessOf(async () => {
        t += 90_000; // 90초 걸렸다
        throw error;
      }),
      meter,
      { now: () => t },
    );
    await expect(h.prompt('x', {} as never)).rejects.toBe(error);
    expect(added).toEqual([90 * FAILED_CALL_NEURONS_PER_SECOND]);
  });

  it('기록이 실패해도 응답은 돌려주고 알린다', async () => {
    const warned: unknown[] = [];
    const meter = {
      add: async () => {
        throw new Error('D1 없음');
      },
    };
    const h = meteredHarness(harnessOf(async () => gemmaResponse), meter, { onMeterError: (e) => warned.push(e) });
    expect(await h.prompt('x', {} as never)).toBe(gemmaResponse);
    expect(warned).toHaveLength(1);
  });
});
