// 도구 안 harness.prompt의 Neuron을 전체 안전선(스펙 11.4-3) 카운터에 더한다.
// 바깥 턴은 diet-coach.ts의 useResponseFinish가 따로 더한다(도구 안 사용량은 거기 들어가지 않는다, 스펙 11.5).
// 성공하면 토큰 × 모델 단가, 실패하거나 시간이 지나 사용량을 모르면 걸린 초 × FAILED_CALL_NEURONS_PER_SECOND로 센다.
import { FAILED_CALL_NEURONS_PER_SECOND } from '../core/guard.ts';
import { estimateNeurons } from '../core/neurons.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { toTokenUsage } from './flue-plan-generator.ts';
import { NEURON_PRICES } from './models.ts';

export interface NeuronMeter {
  add(neurons: number): Promise<void>;
}

export interface MeterOptions {
  now?: () => number;
  /** 기록 실패. 사용자 요청은 깨지 않고 알리기만 한다 */
  onMeterError?: (error: unknown) => void;
}

type PromptResponse = Parameters<typeof toTokenUsage>[0];

export function meteredHarness(harness: PromptHarness, meter: NeuronMeter, options: MeterOptions = {}): PromptHarness {
  const now = options.now ?? Date.now;
  const record = async (neurons: number) => {
    try {
      await meter.add(neurons);
    } catch (error) {
      options.onMeterError?.(error);
    }
  };

  const prompt = async (...args: Parameters<PromptHarness['prompt']>) => {
    const started = now();
    let res: PromptResponse;
    try {
      res = (await (harness.prompt as (...a: unknown[]) => Promise<unknown>)(...args)) as PromptResponse;
    } catch (error) {
      await record(((now() - started) / 1000) * FAILED_CALL_NEURONS_PER_SECOND);
      throw error;
    }
    await record(
      estimateNeurons(toTokenUsage(res), NEURON_PRICES, {
        unknownModel: 'max-price',
        onUnknownModel: (model) => options.onMeterError?.(new Error(`단가를 모르는 모델: ${model}`)),
      }),
    );
    return res;
  };
  return { prompt: prompt as unknown as PromptHarness['prompt'] };
}
