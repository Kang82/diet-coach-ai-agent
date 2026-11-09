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
import { FINISH_ONLY } from '../core/plan-prompt.ts';
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

type Message = { role?: unknown; content?: unknown };

/** user 메시지의 첫 텍스트. content는 문자열이나 텍스트 블록 배열 */
function firstText(m: Message): unknown {
  return Array.isArray(m.content) ? (m.content[0] as { text?: unknown } | undefined)?.text : m.content;
}

/** user 메시지가 도구 안 프롬프트(첫 줄 FINISH_ONLY)인지 */
function isToolPrompt(m: Message): boolean {
  if (m.role !== 'user') return false;
  const first = firstText(m);
  return typeof first === 'string' && first.startsWith(FINISH_ONLY);
}

/** Flue가 대화에 붙이는 signal 기록(user 역할, `<signal type="…">`)인지 (B21 실제 확인) */
function isSignal(m: Message): boolean {
  const first = firstText(m);
  return typeof first === 'string' && first.startsWith('<signal ');
}

/**
 * 같은 harness의 앞 프롬프트 대화를 잘라 보낸다 (B18, tasks.md T14-1). 모든 모델에 건다.
 * 만들기 도구는 같은 harness로 생성 뒤 다시 추천을 불러, 다시 추천 요청에 생성 대화(약 8천 토큰, 1회 약 200 Neuron)가 갔다.
 * Flue에는 같은 도구 호출 안에서 새 대화를 여는 API가 없고 compact()는 LLM 요약이라 여기서 자른다.
 * 맨 앞 system·developer 메시지와, 마지막 도구 안 프롬프트부터 끝(그 프롬프트의 finish 재요청 등)까지 남긴다.
 * 도구 안 프롬프트가 하나뿐이면(생성, 칸 수정, 분류) 또는 바깥 턴이면 그대로다. 다시 추천 프롬프트는 지금 식단표·위반·규칙을 다 담는다
 */
export function dropEarlierPrompts(payload: Payload): Payload {
  if (typeof payload !== 'object' || payload === null) return payload;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return payload;
  const prompts = messages.flatMap((m: Message, i) => (isToolPrompt(m) ? [i] : []));
  if (prompts.length < 2) return payload;
  const head = messages.findIndex((m: Message) => m.role !== 'system' && m.role !== 'developer');
  const last = prompts[prompts.length - 1]!;
  return { ...payload, messages: [...messages.slice(0, head), ...messages.slice(last)] };
}

/**
 * 바깥 턴 출력 상한 (T19-6). 바깥 턴은 추론 low로 도구 하나를 부르기만 한다(약 200~450토큰, B4 기록).
 * 인젝션으로 길게 출력시켜도 1회 약 56 Neuron(gemma 출력 단가)을 넘지 않는다
 */
export const OUTER_TURN_MAX_TOKENS = 2_048;

/**
 * 모든 모델 공통 요청 보정 (provider.ts).
 * - 도구 안 요청(FINISH_ONLY 프롬프트가 있음): dropEarlierPrompts 그대로
 * - 바깥 턴(프롬프트 없음, T19-6): 맨 앞 system·developer와 마지막 user 메시지부터 끝까지만 보내고, 출력 상한이 없으면 넣는다.
 *   바깥 턴은 대화 기록 전체를 보내 메시지를 쌓으면 입력이 계속 커졌다(도구 결과 식단표 JSON도 다시 들어감).
 *   도구는 메시지를 useDelivery()로 직접 읽고 모두 terminate라 앞 기록이 필요 없다
 */
export function fitRequest(payload: Payload): Payload {
  if (typeof payload !== 'object' || payload === null) return payload;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return payload;
  if (messages.some((m: Message) => isToolPrompt(m))) return dropEarlierPrompts(payload);
  // Flue는 사용자 메시지 뒤에 <signal type="instructions|resources">를 user 메시지로 붙인다(지시·도구가 바뀐 표지, 지시 원문은 system에 있다).
  // signal이 아닌 마지막 user 메시지가 이번 요청이다. 화면 메시지는 접두어로 시작해 signal로 보일 수 없다(chat은 미들웨어가 거절)
  const lastUser = messages.findLastIndex((m: Message) => m.role === 'user' && !isSignal(m));
  if (lastUser < 0) return payload;
  const head = messages.findIndex((m: Message) => m.role !== 'system' && m.role !== 'developer');
  const p = payload as { max_completion_tokens?: unknown };
  return {
    ...payload,
    messages: [...messages.slice(0, head), ...messages.slice(lastUser)],
    ...(p.max_completion_tokens === undefined ? { max_completion_tokens: OUTER_TURN_MAX_TOKENS } : {}),
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
  /** 모든 모델에 거는 보정. 모델별 보정보다 먼저 건다 (B18 dropEarlierPrompts) */
  common?: PayloadFix,
): P {
  const wrap =
    (original: StreamFn): StreamFn =>
    (model: { id: string }, context: unknown, options?: StreamOptions) => {
      let next = options;
      const cap = ownCap(caps, model.id);
      if (cap !== undefined && next?.maxTokens === undefined) next = { ...next, maxTokens: cap };
      const own = ownFix(fixes, model.id);
      const fix: PayloadFix | undefined =
        common && own ? (p) => own(common(p)) : (common ?? own);
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
