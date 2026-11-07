// B14(T8-7). 모델별 출력 상한.
// Flue의 Workers AI 공급자는 options.maxTokens가 있을 때만 max_completion_tokens를 보내는데, harness.prompt에는 그 옵션이 없다.
// 그래서 모델의 Workers AI 기본 상한이 그대로 쓰인다. gemma는 기본값이 없어 괜찮지만, gpt-oss-120b·llama-4-scout는 256토큰이라
// 구조화 출력이 잘리고 Flue가 같은 요청을 계속 다시 보내 한도를 빠르게 쓴다 (docs/experiments/2026-11-06-b6-end-to-end.md).
// 공급자의 stream·streamSimple을 감싸 여기 적은 모델에만 maxTokens를 넣는다. 새 모델은 Workers AI 스키마의 max_tokens 기본값부터 확인한다.

/** Workers AI 모델 ID(공급자 접두어 없이) → 출력 상한. 값은 pi-ai 카탈로그의 maxTokens */
export const OUTPUT_CAPS: Readonly<Record<string, number>> = {
  '@cf/openai/gpt-oss-120b': 16_384,
};

/** pi-ai Provider의 stream·streamSimple. 제네릭 시그니처를 그대로 받으려고 넓게 둔다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamFn = (model: any, context: any, options?: any) => any;

/** 같은 provider 객체의 stream·streamSimple만 바꿔 돌려준다(다른 속성과 심볼은 그대로) */
export function withOutputCaps<P extends { stream: StreamFn; streamSimple: StreamFn }>(
  provider: P,
  caps: Readonly<Record<string, number>>,
): P {
  const wrap =
    (original: StreamFn): StreamFn =>
    (model: { id: string }, context: unknown, options?: { maxTokens?: number }) => {
      const cap = caps[model.id];
      const next = cap === undefined || options?.maxTokens !== undefined ? options : { ...options, maxTokens: cap };
      return original(model, context, next);
    };
  const stream = provider.stream.bind(provider);
  const streamSimple = provider.streamSimple.bind(provider);
  provider.stream = wrap(stream) as P['stream'];
  provider.streamSimple = wrap(streamSimple) as P['streamSimple'];
  return provider;
}
