// B14(T8-7). 모델별 Workers AI 요청 보정: 출력 상한, 요청 본문 형식.
//
// 출력 상한: Flue의 Workers AI 공급자는 options.maxTokens가 있을 때만 max_completion_tokens를 보내는데, harness.prompt에는 그 옵션이 없다.
// 그래서 모델의 Workers AI 기본 상한이 그대로 쓰인다. gemma·glm은 기본값이 없어 괜찮지만, gpt-oss-120b·llama-4-scout·mistral-small·granite는
// 256토큰이라 구조화 출력이 잘리고 Flue가 같은 요청을 계속 다시 보내 한도를 빠르게 쓴다 (docs/experiments/2026-11-06-b6-end-to-end.md).
//
// 요청 본문: Workers AI gpt-oss-120b는 messages[].content로 문자열(또는 텍스트 배열)만 받고 null을 받지 않는다. Flue가 두 번째 턴에 보내는
// 도구를 부른 assistant 메시지(content: null)가 400(5006 Bad input)이 됐다. 문자열로 맞추면 통한다 (docs/experiments/2026-11-08-b14-payload-check.md).
//
// 공급자의 stream·streamSimple을 감싸 여기 적은 모델에만 적용한다(provider.ts). 새 후보 모델은 Workers AI 스키마의 max_tokens 기본값을 보고
// OUTPUT_CAPS에 상한이나 null(상한 없음)을 적는다. 빠지면 타입 검사가 실패한다.
import { MODEL_CANDIDATES, type ModelId } from './models.ts';

/** 후보 모델 → 출력 상한. null은 Workers AI 기본 상한이 없어 넣지 않는 모델. 값은 우리 쓰임(구조화 출력 수천~1만여 토큰)에 넉넉하게 */
export const OUTPUT_CAPS = {
  [MODEL_CANDIDATES.gemma]: null,
  [MODEL_CANDIDATES.glm]: null,
  [MODEL_CANDIDATES.granite]: 16_384,
  [MODEL_CANDIDATES.mistral]: 16_384,
  [MODEL_CANDIDATES.llamaScout]: 16_384,
  [MODEL_CANDIDATES.gptOss120b]: 16_384,
} as const satisfies Record<ModelId, number | null>;

/** 공급자가 보는 모델 ID(접두어 'cloudflare/' 없음) → 상한. 상한 없는 모델은 뺀다 */
export function capsByWorkersAiId(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, cap] of Object.entries(OUTPUT_CAPS)) {
    if (cap !== null) out[id.replace(/^cloudflare\//, '')] = cap;
  }
  return out;
}

type Payload = unknown;
type PayloadFix = (payload: Payload) => Payload;

/** 배열 content는 텍스트를 줄바꿈으로 합치고, null은 빈 문자열로 바꾼다. 다른 필드는 그대로 */
export function stringContent(payload: Payload): Payload {
  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as { messages?: unknown }).messages)) return payload;
  const p = payload as { messages: { content?: unknown }[] };
  return {
    ...p,
    messages: p.messages.map((m) => {
      if (m.content === null || m.content === undefined) return { ...m, content: '' };
      if (Array.isArray(m.content)) {
        const text = m.content.map((b: { text?: unknown }) => (typeof b?.text === 'string' ? b.text : '')).join('\n');
        return { ...m, content: text };
      }
      return m;
    }),
  };
}

/** Workers AI ID → 요청 본문 보정 */
export const PAYLOAD_FIXES: Readonly<Record<string, PayloadFix>> = {
  '@cf/openai/gpt-oss-120b': stringContent,
};

/** pi-ai Provider의 stream·streamSimple. 제네릭 시그니처를 그대로 받으려고 넓게 둔다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamFn = (model: any, context: any, options?: any) => any;

type StreamOptions = { maxTokens?: number; onPayload?: (payload: Payload, model: unknown) => unknown };

/** 표의 자기 키만 본다. 프로토타입 이름(constructor 등)이나 이상한 값이 상한·보정으로 쓰이지 않게 한다 (배포 전 보안 리뷰 B14) */
function ownCap(caps: Readonly<Record<string, number>>, id: string): number | undefined {
  if (!Object.hasOwn(caps, id)) return undefined;
  const cap = caps[id];
  return typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : undefined;
}

function ownFix(fixes: Readonly<Record<string, PayloadFix>>, id: string): PayloadFix | undefined {
  if (!Object.hasOwn(fixes, id)) return undefined;
  const fix = fixes[id];
  return typeof fix === 'function' ? fix : undefined;
}

/** 같은 provider 객체의 stream·streamSimple만 바꿔 돌려준다(다른 속성과 심볼은 그대로) */
export function withOutputCaps<P extends { stream: StreamFn; streamSimple: StreamFn }>(
  provider: P,
  caps: Readonly<Record<string, number>>,
  fixes: Readonly<Record<string, PayloadFix>> = {},
): P {
  const wrap =
    (original: StreamFn): StreamFn =>
    (model: { id: string }, context: unknown, options?: StreamOptions) => {
      let next = options;
      const cap = ownCap(caps, model.id);
      if (cap !== undefined && next?.maxTokens === undefined) next = { ...next, maxTokens: cap };
      const fix = ownFix(fixes, model.id);
      if (fix) {
        // 호출자의 onPayload(문서 첨부 변환 등)가 있으면 그 결과에 보정을 건다
        const caller = next?.onPayload;
        next = {
          ...next,
          onPayload: async (payload: Payload, payloadModel: unknown) => {
            const changed = await caller?.(payload, payloadModel);
            return fix(changed === undefined ? payload : changed);
          },
        };
      }
      return original(model, context, next);
    };
  const stream = provider.stream.bind(provider);
  const streamSimple = provider.streamSimple.bind(provider);
  provider.stream = wrap(stream) as P['stream'];
  provider.streamSimple = wrap(streamSimple) as P['streamSimple'];
  return provider;
}
