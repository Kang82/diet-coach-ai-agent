// 스펙 11장. Cloudflare Workers AI 무료 한도(하루 10,000 Neuron) 안에서 쓰는 모델.
// 최종 모델은 평가 세트로 두 후보를 비교해 정한다.
export const MODEL_CANDIDATES = {
  gemma: 'cloudflare/@cf/google/gemma-4-26b-a4b-it',
  glm: 'cloudflare/@cf/zai-org/glm-4.7-flash',
} as const;

export const DEFAULT_MODEL = MODEL_CANDIDATES.gemma;
