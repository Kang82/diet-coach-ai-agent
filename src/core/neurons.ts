// 스펙 11.4. Neuron 사용량 추정.
// Flue의 usage.cost는 Workers AI 모델에서 항상 0이라 쓰지 않고, 토큰 수 × 모델별 단가로 직접 계산한다.
import type { TokenUsage } from './plan-generator.ts';

/** 100만 토큰당 Neuron. Workers AI 가격표(Price in Neurons)의 값. */
export interface NeuronPrice {
  inputPerM: number;
  outputPerM: number;
}

/** 모델 ID → 단가. 실제 값은 src/agents/models.ts의 NEURON_PRICES. */
export type NeuronPriceTable = Readonly<Record<string, NeuronPrice>>;

export class UnknownModelPriceError extends Error {
  constructor(model: string) {
    super(`모델 단가를 모름: ${model}`);
    this.name = 'UnknownModelPriceError';
  }
}

/**
 * 호출 1번의 Neuron 추정치. 반올림하지 않는다 (합산 뒤 표시할 때 반올림).
 * 단가를 모르는 모델이면 0으로 세지 않고 에러를 던진다. 안전선(11.4-3)이 덜 세면 안 되기 때문이다.
 */
export function estimateNeurons(usage: TokenUsage, prices: NeuronPriceTable): number {
  const price = prices[usage.model];
  if (!price) throw new UnknownModelPriceError(usage.model);
  return (usage.input * price.inputPerM + usage.output * price.outputPerM) / 1_000_000;
}

/** 여러 호출의 Neuron 추정치 합. */
export function totalNeurons(usages: readonly TokenUsage[], prices: NeuronPriceTable): number {
  return usages.reduce((sum, u) => sum + estimateNeurons(u, prices), 0);
}
