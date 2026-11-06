// MenuClassifier의 Flue 구현. harness.prompt를 가짜로 바꿔 끼운다.
import { describe, expect, it } from 'vitest';
import { rulesA } from '../core/__fixtures__/rules-a.ts';
import { buildClassifyPrompt } from '../core/menu-classification.ts';
import { QuotaExceededError } from '../core/quota.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { createFlueMenuClassifier } from './flue-menu-classifier.ts';

const input = { menus: ['국밥'], rules: rulesA, avoid: [] };
const MODEL = 'cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct';

function fakeHarness(reply: unknown) {
  const prompts: { text: string; options: Record<string, unknown> }[] = [];
  const harness = {
    prompt: (async (text: string, options: Record<string, unknown>) => {
      prompts.push({ text, options });
      if (reply instanceof Error) throw reply;
      return {
        data: reply,
        usage: { input: 600, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 800, cost: {} },
        model: { provider: 'cloudflare', id: '@cf/meta/llama-4-scout-17b-16e-instruct' },
      };
    }) as unknown as PromptHarness['prompt'],
  };
  return { harness, prompts };
}

describe('createFlueMenuClassifier', () => {
  it('분류 프롬프트, 대상 스키마, 모델, 추론 low로 부르고 결과와 사용량을 돌려준다', async () => {
    const { harness, prompts } = fakeHarness({
      classes: [{ menu: '국밥', class: 'weekly_max_1', reason: '기름', criterionIds: null, orderTips: ['국물 남기기'] }],
    });

    const res = await createFlueMenuClassifier(harness, MODEL).classify(input);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.text).toBe(buildClassifyPrompt(input));
    expect(prompts[0]!.options).toMatchObject({ model: MODEL, thinkingLevel: 'low' });
    expect(prompts[0]!.options.result).toBeDefined();
    expect(res).toEqual({
      value: [{ menu: '국밥', class: 'weekly_max_1', reason: '기름', criterionIds: [], orderTips: ['국물 남기기'] }],
      usage: { model: MODEL, input: 600, output: 200 },
    });
  });

  it('한도 초과 에러는 QuotaExceededError로 바꾼다', async () => {
    const { harness } = fakeHarness(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
    await expect(createFlueMenuClassifier(harness, MODEL).classify(input)).rejects.toBeInstanceOf(QuotaExceededError);
  });
});
