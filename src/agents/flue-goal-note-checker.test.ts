// GoalNoteChecker의 Flue 구현. harness.prompt를 가짜로 바꿔 끼운다.
import { describe, expect, it } from 'vitest';
import { buildGoalNotePrompt } from '../core/interview-note.ts';
import { QuotaExceededError } from '../core/quota.ts';
import { createFlueGoalNoteChecker } from './flue-goal-note-checker.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { GoalNoteCheckSchema } from './interview-schema.ts';

const input = { goals: ['weight_loss' as const], note: '한 달에 10kg' };
const MODEL = 'cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct';

function fakeHarness(reply: unknown) {
  const prompts: { text: string; options: Record<string, unknown> }[] = [];
  const harness = {
    prompt: (async (text: string, options: Record<string, unknown>) => {
      prompts.push({ text, options });
      if (reply instanceof Error) throw reply;
      return {
        data: reply,
        usage: { input: 500, output: 30, cacheRead: 0, cacheWrite: 0, totalTokens: 530, cost: {} },
        model: { provider: 'cloudflare', id: '@cf/meta/llama-4-scout-17b-16e-instruct' },
      };
    }) as unknown as PromptHarness['prompt'],
  };
  return { harness, prompts };
}

describe('createFlueGoalNoteChecker', () => {
  it('메모 프롬프트, 스키마, 모델, 추론 low로 부르고 결과와 사용량을 돌려준다', async () => {
    const { harness, prompts } = fakeHarness({ stopFlags: null, turnFlags: ['extreme_restriction'], choices: ['한 달에 2kg'] });

    const res = await createFlueGoalNoteChecker(harness, MODEL).check(input);

    expect(prompts).toEqual([
      {
        text: buildGoalNotePrompt(input),
        // 시간 제한 signal이 붙는다 (B6, prompt-call.ts)
        options: { result: GoalNoteCheckSchema, model: MODEL, thinkingLevel: 'low', signal: expect.any(AbortSignal) },
      },
    ]);
    expect(res).toEqual({
      value: { stopFlags: [], turnFlags: ['extreme_restriction'], choices: ['한 달에 2kg'] },
      usage: { model: MODEL, input: 500, output: 30 },
    });
  });

  it('한도 초과 에러는 QuotaExceededError로 바꾼다', async () => {
    const original = new Error('AiError: 4006: you have used up your daily free allocation of 10,000 neurons');
    const { harness } = fakeHarness(original);
    const error = await createFlueGoalNoteChecker(harness, MODEL).check(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect((error as Error).cause).toBe(original);
  });
});
