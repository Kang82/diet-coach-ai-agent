// 스펙 11장. Cloudflare Workers AI 무료 한도(하루 10,000 Neuron) 안에서 쓰는 모델.
// 최종 모델은 평가 세트로 두 후보를 비교해 정한다.
import type { NeuronPriceTable } from '../core/neurons.ts';

export const MODEL_CANDIDATES = {
  gemma: 'cloudflare/@cf/google/gemma-4-26b-a4b-it',
  glm: 'cloudflare/@cf/zai-org/glm-4.7-flash',
} as const;

export const DEFAULT_MODEL = MODEL_CANDIDATES.gemma;

type ModelId = (typeof MODEL_CANDIDATES)[keyof typeof MODEL_CANDIDATES];

// 스펙 11.4. 100만 토큰당 Neuron. Workers AI 가격표에서 옮겨 적었다 (2026-11-06 확인).
// https://developers.cloudflare.com/workers-ai/platform/pricing/
// 후보를 추가하면 여기에도 넣어야 타입 검사를 통과한다.
export const NEURON_PRICES = {
  [MODEL_CANDIDATES.gemma]: { inputPerM: 9_091, outputPerM: 27_273 },
  [MODEL_CANDIDATES.glm]: { inputPerM: 5_500, outputPerM: 36_400 },
} as const satisfies Record<ModelId, NeuronPriceTable[string]> & NeuronPriceTable;
