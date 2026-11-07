// B14(T8-7). Flue는 Workers AI에 출력 상한(max_completion_tokens)을 보내지 않아 모델 기본값이 쓰인다.
// 기본값이 256토큰인 모델(gpt-oss-120b 등)은 구조화 출력이 잘리므로 그 모델에만 maxTokens를 넣는다.
import { describe, expect, it } from 'vitest';
import { OUTPUT_CAPS, withOutputCaps } from './output-caps.ts';

function fakeProvider() {
  const calls: { fn: string; model: string; options: unknown }[] = [];
  const marker = Symbol('template');
  const provider = {
    id: 'cloudflare',
    [marker]: 'kept',
    stream: (model: { id: string }, _context: unknown, options?: Record<string, unknown>) => {
      calls.push({ fn: 'stream', model: model.id, options });
      return 'stream-result';
    },
    streamSimple: (model: { id: string }, _context: unknown, options?: Record<string, unknown>) => {
      calls.push({ fn: 'streamSimple', model: model.id, options });
      return 'simple-result';
    },
  };
  return { provider, calls, marker };
}

describe('withOutputCaps', () => {
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

  it('같은 provider 객체를 돌려주어 다른 속성(동적 모델 템플릿 심볼 등)이 남는다', () => {
    const { provider, marker } = fakeProvider();
    const capped = withOutputCaps(provider, {});
    expect(capped).toBe(provider);
    expect((capped as Record<symbol, unknown>)[marker]).toBe('kept');
  });

  it('gpt-oss-120b는 pi-ai 카탈로그 maxTokens(16,384)를 상한으로 둔다. gemma는 넣지 않는다', () => {
    expect(OUTPUT_CAPS).toEqual({ '@cf/openai/gpt-oss-120b': 16_384 });
  });
});
