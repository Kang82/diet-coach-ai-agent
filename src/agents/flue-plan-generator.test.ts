// PlanGenerator의 Flue 구현. 실제 모델 대신 harness.prompt를 가짜로 바꿔 끼운다.
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { rulesA } from '../core/__fixtures__/rules-a.ts';
import { estimateNeurons } from '../core/neurons.ts';
import { buildGeneratePrompt } from '../core/plan-prompt.ts';
import { QuotaExceededError } from '../core/quota.ts';
import type { PlanCell } from '../core/types.ts';
import { createFluePlanGenerator, type PromptHarness } from './flue-plan-generator.ts';
import { NEURON_PRICES } from './models.ts';
import { PlanCellsResultSchema } from './plan-schema.ts';

const generateInput = () => ({
  profile: structuredClone(profileA),
  rules: structuredClone(rulesA),
  classes: structuredClone(classesA),
  weekStart: planA.weekStart,
  events: [],
});

const usage = (input: number, output: number) => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + output,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

/** 받은 프롬프트를 기록하고, 정해 둔 칸(또는 에러)을 돌려주는 가짜 harness */
function fakeHarness(reply: PlanCell[] | Error) {
  const prompts: { text: string; result: unknown; thinkingLevel?: unknown }[] = [];
  const harness = {
    prompt: (async (text: string, options: { result: unknown; thinkingLevel?: unknown }) => {
      prompts.push({ text, result: options.result, ...('thinkingLevel' in options ? { thinkingLevel: options.thinkingLevel } : {}) });
      if (reply instanceof Error) throw reply;
      return {
        data: { cells: structuredClone(reply) },
        usage: usage(1_648, 6_226),
        model: { provider: 'cloudflare', id: '@cf/google/gemma-4-26b-a4b-it' },
      };
    }) as unknown as PromptHarness['prompt'],
  };
  return { harness, prompts };
}

describe('createFluePlanGenerator', () => {
  it('생성 프롬프트와 칸 스키마로 부르고, 칸과 사용량을 돌려준다', async () => {
    const { harness, prompts } = fakeHarness(planA.cells);

    const res = await createFluePlanGenerator(harness).generatePlan(generateInput());

    expect(prompts).toEqual([{ text: buildGeneratePrompt(generateInput()), result: PlanCellsResultSchema }]);
    expect(res.value).toEqual(planA.cells);
    expect(res.usage).toEqual({ model: 'cloudflare/@cf/google/gemma-4-26b-a4b-it', input: 1_648, output: 6_226 });
  });

  it('사용량의 모델 이름이 단가표 키와 맞아 Neuron을 계산할 수 있다', async () => {
    const { harness } = fakeHarness(planA.cells);

    const { usage: u } = await createFluePlanGenerator(harness).generatePlan(generateInput());

    expect(Math.round(estimateNeurons(u, NEURON_PRICES))).toBe(185);
  });

  it('menuId를 정규화한다: 괄호 설명을 떼고, 외식은 그 끼니 메뉴 목록의 글자로 맞춘다', async () => {
    const cells = structuredClone(planA.cells);
    cells[0]!.menuId = ' 회 덮밥 (초장 절반) '; // 월요일 점심, 외식
    cells[1]!.menuId = '두부 채소 볶음 (간장 양념)'; // 월요일 저녁, 집밥
    const { harness } = fakeHarness(cells);

    const { value } = await createFluePlanGenerator(harness).generatePlan(generateInput());

    expect(value[0]!.menuId).toBe('회덮밥');
    expect(value[1]!.menuId).toBe('두부 채소 볶음');
  });

  it('다시 추천은 다시 추천 프롬프트로 부른다', async () => {
    const { harness, prompts } = fakeHarness([planA.cells[2]!]);

    const res = await createFluePlanGenerator(harness).regenerateCells({
      ...generateInput(),
      plan: structuredClone(planA),
      targets: [{ day: 'tue', meal: 'lunch' }],
      violations: [],
      userRequest: '생선 말고',
    });

    expect(prompts[0]!.text).toContain('"다시 만들 칸" 1곳만');
    expect(prompts[0]!.text).toContain('생선 말고');
    expect(res.value).toEqual([planA.cells[2]]);
  });

  it('추론 수준을 정하면 생성과 다시 추천 모두에 실어 보내고, 없으면 보내지 않는다', async () => {
    const { harness, prompts } = fakeHarness(planA.cells);
    await createFluePlanGenerator(harness, { thinkingLevel: 'low' }).generatePlan(generateInput());
    await createFluePlanGenerator(harness, { thinkingLevel: 'low' }).regenerateCells({
      ...generateInput(),
      plan: structuredClone(planA),
      targets: [{ day: 'tue', meal: 'lunch' }],
      violations: [],
    });
    await createFluePlanGenerator(harness).generatePlan(generateInput());

    expect(prompts.map((p) => p.thinkingLevel)).toEqual(['low', 'low', undefined]);
    expect(prompts[2]).not.toHaveProperty('thinkingLevel');
  });

  it('한도 초과 에러는 QuotaExceededError로 바꾸고 원래 에러를 cause로 둔다', async () => {
    const original = new Error('AiError: 4006: you have used up your daily free allocation of 10,000 neurons');
    const { harness } = fakeHarness(original);

    const error = await createFluePlanGenerator(harness).generatePlan(generateInput()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QuotaExceededError);
    expect((error as Error).cause).toBe(original);
  });

  it('다른 에러는 그대로 던진다', async () => {
    const original = new Error('스키마 검증 실패');
    const { harness } = fakeHarness(original);

    await expect(createFluePlanGenerator(harness).generatePlan(generateInput())).rejects.toBe(original);
  });
});

describe('PlanCellsResultSchema', () => {
  it('페르소나 A 식단표의 칸을 통과시킨다', () => {
    expect(v.safeParse(PlanCellsResultSchema, { cells: planA.cells }).success).toBe(true);
  });

  it.each([
    ['알 수 없는 태그', { tags: ['spicy'] }],
    ['알 수 없는 요일', { day: 'monday' }],
    ['음수 조리 시간', { cookMinutes: -1 }],
    ['소수 조리 시간', { cookMinutes: 1.5 }],
    ['빈 menuId', { menuId: '' }],
    ['알 수 없는 기준', { criterionIds: ['eat_less'] }],
  ])('형식이 틀리면 거른다: %s', (_, patch) => {
    const cell = { ...planA.cells[0]!, ...patch };
    expect(v.safeParse(PlanCellsResultSchema, { cells: [cell] }).success).toBe(false);
  });

  it('규칙 위반(목록에 없는 메뉴, 빈 criterionIds)은 스키마가 아니라 checkPlan에 맡긴다', () => {
    const cell = { ...planA.cells[0]!, menuId: '짜장면', criterionIds: [] };
    expect(v.safeParse(PlanCellsResultSchema, { cells: [cell] }).success).toBe(true);
  });
});
