// B14(T8-7). Flue는 Workers AI에 출력 상한(max_completion_tokens)을 보내지 않아 모델 기본값이 쓰인다.
// 기본값이 256토큰인 모델(gpt-oss-120b 등)은 구조화 출력이 잘리므로 그 모델에만 maxTokens를 넣는다.
// gpt-oss-120b는 Flue의 두 번째 턴 메시지 형식(배열·null content)을 400으로 거절해 요청 본문을 문자열 content로 맞춘다.
import { describe, expect, it } from 'vitest';
import { MODEL_CANDIDATES } from './models.ts';
import { capsByWorkersAiId, OUTPUT_CAPS, PAYLOAD_FIXES, stringContent, withOutputCaps } from './output-caps.ts';

type Options = Record<string, unknown> & { onPayload?: (payload: unknown, model: unknown) => unknown };

function fakeProvider() {
  const calls: { fn: string; model: string; options: Options | undefined }[] = [];
  const marker = Symbol('template');
  const provider = {
    id: 'cloudflare',
    [marker]: 'kept',
    stream: (model: { id: string }, _context: unknown, options?: Options) => {
      calls.push({ fn: 'stream', model: model.id, options });
      return 'stream-result';
    },
    streamSimple: (model: { id: string }, _context: unknown, options?: Options) => {
      calls.push({ fn: 'streamSimple', model: model.id, options });
      return 'simple-result';
    },
  };
  return { provider, calls, marker };
}

describe('withOutputCaps: 출력 상한', () => {
  it('상한을 정한 모델은 stream·streamSimple 모두 maxTokens를 넣는다', () => {
    const { provider, calls } = fakeProvider();
    const capped = withOutputCaps(provider, { 'm-small': 1000 });

    expect(capped.stream({ id: 'm-small' }, {}, { reasoning: 'low' })).toBe('stream-result');
    expect(capped.streamSimple({ id: 'm-small' }, {}, undefined)).toBe('simple-result');

    expect(calls).toEqual([
      { fn: 'stream', model: 'm-small', options: { reasoning: 'low', maxTokens: 1000 } },
      { fn: 'streamSimple', model: 'm-small', options: { maxTokens: 1000 } },
    ]);
  });

  it('상한이 없는 모델은 options를 그대로 넘긴다', () => {
    const { provider, calls } = fakeProvider();
    const options = { reasoning: 'medium' };
    withOutputCaps(provider, { 'm-small': 1000 }).stream({ id: 'gemma' }, {}, options);
    expect(calls[0]!.options).toBe(options);
  });

  it('호출자가 maxTokens를 정했으면 덮어쓰지 않는다', () => {
    const { provider, calls } = fakeProvider();
    withOutputCaps(provider, { 'm-small': 1000 }).stream({ id: 'm-small' }, {}, { maxTokens: 50 });
    expect(calls[0]!.options).toEqual({ maxTokens: 50 });
  });

  it('표의 자기 키만 본다: constructor 같은 프로토타입 이름이나 숫자가 아닌 값은 상한으로 쓰지 않는다 (보안 리뷰)', () => {
    const { provider, calls } = fakeProvider();
    const caps = { bad: Number.NaN, nul: null } as unknown as Record<string, number>;
    const capped = withOutputCaps(provider, caps);
    for (const id of ['constructor', 'toString', '__proto__', 'bad', 'nul']) capped.stream({ id }, {}, {});
    expect(calls.map((c) => c.options)).toEqual([{}, {}, {}, {}, {}]);
  });

  it('같은 provider 객체를 돌려주어 다른 속성(동적 모델 템플릿 심볼 등)이 남는다', () => {
    const { provider, marker } = fakeProvider();
    const capped = withOutputCaps(provider, {});
    expect(capped).toBe(provider);
    expect((capped as Record<symbol, unknown>)[marker]).toBe('kept');
  });
});

describe('OUTPUT_CAPS', () => {
  it('후보 모델마다 상한을 정하거나 상한 없음(null)을 명시한다. Workers AI 기본 256인 모델은 16,384', () => {
    expect(Object.keys(OUTPUT_CAPS).sort()).toEqual(Object.values(MODEL_CANDIDATES).sort());
    expect(OUTPUT_CAPS).toEqual({
      [MODEL_CANDIDATES.gemma]: null,
      [MODEL_CANDIDATES.glm]: null,
      [MODEL_CANDIDATES.granite]: 16_384,
      [MODEL_CANDIDATES.mistral]: 16_384,
      [MODEL_CANDIDATES.llamaScout]: 16_384,
      [MODEL_CANDIDATES.gptOss120b]: 16_384,
    });
  });

  it('공급자에 넘기는 표는 접두어 없는 Workers AI ID이고 상한 없는 모델은 빠진다', () => {
    expect(capsByWorkersAiId()).toEqual({
      '@cf/ibm-granite/granite-4.0-h-micro': 16_384,
      '@cf/mistralai/mistral-small-3.1-24b-instruct': 16_384,
      '@cf/meta/llama-4-scout-17b-16e-instruct': 16_384,
      '@cf/openai/gpt-oss-120b': 16_384,
    });
  });
});

describe('stringContent: gpt-oss 요청 본문 맞추기', () => {
  it('배열 content는 텍스트를 줄바꿈으로 합치고, null은 빈 문자열로 바꾼다. 다른 필드는 그대로', () => {
    const payload = {
      messages: [
        { role: 'system', content: '지시' },
        { role: 'user', content: [{ type: 'text', text: '첫 줄' }, { type: 'text', text: '둘째 줄' }] },
        { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 't1', content: '결과' },
      ],
      tools: [{ type: 'function' }],
      max_completion_tokens: 16_384,
    };

    expect(stringContent(payload)).toEqual({
      messages: [
        { role: 'system', content: '지시' },
        { role: 'user', content: '첫 줄\n둘째 줄' },
        { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 't1', content: '결과' },
      ],
      tools: [{ type: 'function' }],
      max_completion_tokens: 16_384,
    });
  });

  it('messages가 없으면 그대로 돌려준다', () => {
    const payload = { prompt: 'x' };
    expect(stringContent(payload)).toBe(payload);
  });

  it('gpt-oss-120b에만 건다', () => {
    expect(Object.keys(PAYLOAD_FIXES)).toEqual(['@cf/openai/gpt-oss-120b']);
  });
});

describe('withOutputCaps: 요청 본문 보정', () => {
  it('보정 대상 모델은 onPayload로 본문을 고치고, 호출자의 onPayload 뒤에 적용한다', async () => {
    const { provider, calls } = fakeProvider();
    const fix = (p: unknown) => ({ ...(p as object), fixed: true });
    const capped = withOutputCaps(provider, {}, { 'm-fix': fix });
    const caller = async (p: unknown) => ({ ...(p as object), caller: true });

    capped.stream({ id: 'm-fix' }, {}, { onPayload: caller });
    capped.stream({ id: 'm-fix' }, {}, {});
    capped.stream({ id: 'other' }, {}, {});

    const withCaller = await calls[0]!.options!.onPayload!({ a: 1 }, {});
    const alone = await calls[1]!.options!.onPayload!({ a: 1 }, {});
    expect(withCaller).toEqual({ a: 1, caller: true, fixed: true });
    expect(alone).toEqual({ a: 1, fixed: true });
    expect(calls[2]!.options).toEqual({});
  });

  it('호출자의 onPayload가 undefined를 돌려주면 원래 본문에 보정을 건다', async () => {
    const { provider, calls } = fakeProvider();
    const capped = withOutputCaps(provider, {}, { 'm-fix': (p) => ({ ...(p as object), fixed: true }) });
    capped.stream({ id: 'm-fix' }, {}, { onPayload: async () => undefined });
    expect(await calls[0]!.options!.onPayload!({ a: 1 }, {})).toEqual({ a: 1, fixed: true });
  });
});
