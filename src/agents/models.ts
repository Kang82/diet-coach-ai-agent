// 스펙 11장. Cloudflare Workers AI 무료 한도(하루 10,000 Neuron) 안에서 쓰는 모델.
// 최종 모델은 평가 세트로 두 후보를 비교해 정한다.
import type { NeuronPriceTable } from '../core/neurons.ts';

export const MODEL_CANDIDATES = {
  gemma: 'cloudflare/@cf/google/gemma-4-26b-a4b-it',
  glm: 'cloudflare/@cf/zai-org/glm-4.7-flash',
  // 인터뷰 추출 비교에 쓴 추론하지 않는 모델 (tasks.md B4). 목표 메모 확인은 llamaScout를 쓴다
  granite: 'cloudflare/@cf/ibm-granite/granite-4.0-h-micro',
  mistral: 'cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct',
  llamaScout: 'cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct',
  // 식단 생성 비교 후보 (tasks.md B14 T8-7). 기본 출력 상한 256토큰이라 output-caps.ts에 상한을 넣어야 쓸 수 있다
  gptOss120b: 'cloudflare/@cf/openai/gpt-oss-120b',
} as const;

export const DEFAULT_MODEL = MODEL_CANDIDATES.gemma;

/**
 * 인터뷰(추출 호출과 인터뷰 중 바깥 턴)의 추론 수준 (tasks.md B4). 식단표 생성은 Flue 기본값('medium') 그대로 둔다.
 * Flue 기본값에서는 목표 한 줄을 뽑는 데 출력 5,106토큰·89초가 들었다.
 * 'off'는 쓰지 않는다: Flue의 Workers AI 공급자는 low~high일 때만 reasoning_effort를 보내고 'off'면 아무것도 안 보내서
 * 모델 기본 추론이 그대로 돈다(측정에서 출력이 줄지 않았다). 'minimal'과 'low'는 둘 다 "low"로 보낸다.
 */
export const INTERVIEW_THINKING = 'low' as const;

/**
 * 식단 생성·다시 추천의 추론 수준 (tasks.md T8-4). 기본은 undefined(Flue 기본값 'medium')로 지금까지와 같다.
 * 11-06 배포본에서 생성 1회 출력이 평소의 약 2배(14,832토큰, 5분 46초)였다.
 * B11(T8-2, 2026-11-07)에서 'low'를 평가 세트 8회로 재 보니 medium 대비 출력 토큰 중앙값 -7%, 시간은 같아 기본값을 바꾸지 않았다
 * (docs/experiments/2026-11-07-b11-thinking-level.md). gemma는 reasoning_effort에 거의 반응하지 않는다.
 * 개발 중 `.dev.vars`의 PLAN_THINKING(low|medium|high)으로 바꿔 시험한다. 'off'는 받지 않는다(위 INTERVIEW_THINKING 주석)
 */
/**
 * 식단 생성·다시 추천 모델 (tasks.md B14 T8-7). 기본은 undefined(에이전트 기본 모델 gemma를 그대로 씀).
 * 개발 중 `.dev.vars`의 PLAN_MODEL(MODEL_CANDIDATES의 키)로 바꿔 시험한다
 */
export function planModel(key: string | undefined): ModelId | undefined {
  return key && Object.hasOwn(MODEL_CANDIDATES, key) ? MODEL_CANDIDATES[key as keyof typeof MODEL_CANDIDATES] : undefined;
}

export function planThinking(key: string | undefined): 'low' | 'medium' | 'high' | undefined {
  return key === 'low' || key === 'medium' || key === 'high' ? key : undefined;
}

/**
 * 목표 메모 확인 모델 (tasks.md B4). 기본은 llama-4-scout(추론하지 않아 5초 안팎).
 * gemma는 짧은 추출에도 출력 수천 토큰을 썼다 (docs/experiments/2026-11-06-b4-interview-real-run.md).
 * 개발 중 `.dev.vars`의 INTERVIEW_MODEL(MODEL_CANDIDATES의 키)로 바꿔 시험할 수 있다.
 */
export function goalNoteModel(key: string | undefined): ModelId {
  return candidateOr(key, MODEL_CANDIDATES.llamaScout);
}

/**
 * 외식 메뉴 분류 모델 (tasks.md B5, B6). gemma를 쓴다.
 * llama-4-scout는 Workers AI 기본 출력 상한이 256토큰이고 Flue는 max_completion_tokens를 보내지 않는다.
 * 메뉴 5개 분류 JSON이 256토큰에서 잘려 finish를 부르지 못하고 Flue가 재요청을 반복했다
 * (docs/experiments/2026-11-06-b6-end-to-end.md). 목표 메모 확인은 출력이 짧아 llama-4-scout 그대로 둔다.
 * 개발 중 `.dev.vars`의 MENU_MODEL(MODEL_CANDIDATES의 키)로 바꿔 시험할 수 있다.
 */
export function menuClassModel(key: string | undefined): ModelId {
  return candidateOr(key, MODEL_CANDIDATES.gemma);
}

function candidateOr(key: string | undefined, fallback: ModelId): ModelId {
  return key && Object.hasOwn(MODEL_CANDIDATES, key) ? MODEL_CANDIDATES[key as keyof typeof MODEL_CANDIDATES] : fallback;
}

export type ModelId = (typeof MODEL_CANDIDATES)[keyof typeof MODEL_CANDIDATES];

// 스펙 11.4. 100만 토큰당 Neuron. Workers AI 가격표에서 옮겨 적었다 (2026-11-06 확인).
// https://developers.cloudflare.com/workers-ai/platform/pricing/
// 후보를 추가하면 여기에도 넣어야 타입 검사를 통과한다.
export const NEURON_PRICES = {
  [MODEL_CANDIDATES.gemma]: { inputPerM: 9_091, outputPerM: 27_273 },
  [MODEL_CANDIDATES.glm]: { inputPerM: 5_500, outputPerM: 36_400 },
  [MODEL_CANDIDATES.granite]: { inputPerM: 1_542, outputPerM: 10_158 },
  [MODEL_CANDIDATES.mistral]: { inputPerM: 31_876, outputPerM: 50_488 },
  [MODEL_CANDIDATES.llamaScout]: { inputPerM: 24_545, outputPerM: 77_273 },
  // 2026-11-08 Workers AI 모델 API 가격 $0.35 / $0.75 per M ($0.011 = 1,000 Neuron)
  [MODEL_CANDIDATES.gptOss120b]: { inputPerM: 31_818, outputPerM: 68_182 },
} as const satisfies Record<ModelId, NeuronPriceTable[string]> & NeuronPriceTable;
