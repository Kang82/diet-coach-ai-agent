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
 * 단가를 모르는 모델을 만났을 때.
 * - 'throw' (기본): 에러. 테스트와 개발에서 모델 이름이 어긋난 것을 바로 알기 위해.
 * - 'max-price': 표에서 입력·출력 단가가 가장 비싼 값으로 센다. 운영에서 이미 쓴 호출의 결과를 잃지 않으면서
 *   안전선(11.4-3)이 덜 세지 않게 한다. onUnknownModel로 경고를 남긴다.
 */
export type UnknownModelPolicy =
  | { unknownModel: 'throw' }
  | { unknownModel: 'max-price'; onUnknownModel?: (model: string) => void };

/** 호출 1번의 Neuron 추정치. 반올림하지 않는다 (합산 뒤 표시할 때 반올림). */
export function estimateNeurons(
  usage: TokenUsage,
  prices: NeuronPriceTable,
  policy: UnknownModelPolicy = { unknownModel: 'throw' },
): number {
  const price = priceOf(usage.model, prices, policy);
  return (usage.input * price.inputPerM + usage.output * price.outputPerM) / 1_000_000;
}

/** 여러 호출의 Neuron 추정치 합. */
export function totalNeurons(
  usages: readonly TokenUsage[],
  prices: NeuronPriceTable,
  policy?: UnknownModelPolicy,
): number {
  return usages.reduce((sum, u) => sum + estimateNeurons(u, prices, policy), 0);
}

function priceOf(model: string, prices: NeuronPriceTable, policy: UnknownModelPolicy): NeuronPrice {
  // 'constructor' 같은 프로토타입 속성을 단가로 읽지 않도록 자기 속성만 본다.
  if (Object.hasOwn(prices, model)) return prices[model]!;
  if (policy.unknownModel === 'throw') throw new UnknownModelPriceError(model);

  const all = Object.values(prices);
  if (all.length === 0) throw new UnknownModelPriceError(model);
  policy.onUnknownModel?.(model);
  return {
    inputPerM: Math.max(...all.map((p) => p.inputPerM)),
    outputPerM: Math.max(...all.map((p) => p.outputPerM)),
  };
}
