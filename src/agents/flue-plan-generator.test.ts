// PlanGenerator의 Flue 구현. 실제 모델 대신 harness.prompt를 가짜로 바꿔 끼운다.
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { rulesA } from '../core/__fixtures__/rules-a.ts';
import { estimateNeurons } from '../core/neurons.ts';
import { finishCells } from '../core/plan-cells.ts';
import { buildGeneratePrompt } from '../core/plan-prompt.ts';
import { QuotaExceededError } from '../core/quota.ts';
import type { PlanCell } from '../core/types.ts';
import { createFluePlanGenerator, type PromptHarness } from './flue-plan-generator.ts';
import { MODEL_CANDIDATES, NEURON_PRICES } from './models.ts';
import { PlanCellsResultSchema, toPlanCells } from './plan-schema.ts';
import { watchBinding } from './stream-watch.ts';

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
  const prompts: { text: string; result: unknown; thinkingLevel?: unknown; model?: unknown }[] = [];
  const harness = {
    prompt: (async (text: string, options: { result: unknown; thinkingLevel?: unknown; model?: unknown }) => {
      prompts.push({
        text,
        result: options.result,
        ...('thinkingLevel' in options ? { thinkingLevel: options.thinkingLevel } : {}),
        ...('model' in options ? { model: options.model } : {}),
      });
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
    expect(res.value).toEqual(finishCells(planA.cells, profileA, classesA));
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

  it('외식 칸의 제목은 메뉴 이름, 주문 팁은 분류의 팁으로 정리한다 (B17)', async () => {
    const cells = structuredClone(planA.cells);
    delete cells[0]!.orderTip; // 월요일 점심 회덮밥, 제목 '회덮밥 (초장 절반)'
    const { harness } = fakeHarness(cells);

    const { value } = await createFluePlanGenerator(harness).generatePlan(generateInput());

    expect(value[0]).toMatchObject({ title: '회덮밥', orderTip: '초장 절반' });
  });

  it('Workers AI 응답을 지켜봤으면 사용량에 스트림 관찰 결과를 싣는다 (B19)', async () => {
    const binding = watchBinding({ run: async (..._args: unknown[]) => new Response('chunk') });
    const harness = {
      prompt: (async () => {
        const res = (await binding.run('@cf/m', {})) as Response;
        await res.text();
        return { data: { cells: structuredClone(planA.cells) }, usage: usage(10, 20), model: { provider: 'cloudflare', id: 'm' } };
      }) as unknown as PromptHarness['prompt'],
    };

    const { usage: u } = await createFluePlanGenerator(harness).generatePlan(generateInput());

    expect(u.stream).toMatchObject({ requests: 1 });
    expect(u.stream?.firstByteMs).not.toBeNull();
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
    // 다시 추천(칸 수정 포함)도 같은 정리를 거친다: 화요일 점심 백반. 이유·근거는 분류 값(T13-1)
    const 백반 = classesA.find((c) => c.menu === '백반')!;
    expect(res.value).toEqual([
      { ...planA.cells[2], title: '백반', orderTip: '생선 반찬 고르기', reason: 백반.reason, criterionIds: 백반.criterionIds },
    ]);
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

  // B14(T8-7): 식단 생성 모델을 바꿔 시험한다 (models.ts planModel)
  it('모델을 정하면 생성과 다시 추천 모두에 실어 보내고, 없으면 보내지 않는다', async () => {
    const { harness, prompts } = fakeHarness(planA.cells);
    const gen = createFluePlanGenerator(harness, { model: MODEL_CANDIDATES.gptOss120b });
    await gen.generatePlan(generateInput());
    await gen.regenerateCells({ ...generateInput(), plan: structuredClone(planA), targets: [{ day: 'tue', meal: 'lunch' }], violations: [] });
    await createFluePlanGenerator(harness).generatePlan(generateInput());

    expect(prompts.map((p) => p.model)).toEqual([MODEL_CANDIDATES.gptOss120b, MODEL_CANDIDATES.gptOss120b, undefined]);
    expect(prompts[2]).not.toHaveProperty('model');
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

// 받아 줄 수 있는 모양은 받는다 (메뉴 분류 스키마와 같음). 검증 실패면 Flue가 다시 요청해 시간과 Neuron을 더 쓴다
describe('PlanCellsResultSchema: 모델이 낼 법한 모양 (나중에 → 2026-11-08)', () => {
  const base = planA.cells[0]!;

  it('배열 필드에 값 하나를 문자열로 내도 받고, 배열로 바꾼다', () => {
    const cell = { ...base, ingredients: '연어', tags: 'fish', criterionIds: 'reduce_saturated_fat' };
    const parsed = v.safeParse(PlanCellsResultSchema, { cells: [cell] });
    expect(parsed.success).toBe(true);
    const [out] = toPlanCells(parsed.output as never);
    expect(out).toMatchObject({ ingredients: ['연어'], tags: ['fish'], criterionIds: ['reduce_saturated_fat'] });
  });

  it('배열 필드가 null이거나 빠지면 빈 배열, orderTip이 null이면 없앤다', () => {
    const { ingredients: _i, ...rest } = base;
    const cell = { ...rest, tags: null, criterionIds: null, orderTip: null };
    const parsed = v.safeParse(PlanCellsResultSchema, { cells: [cell] });
    expect(parsed.success).toBe(true);
    const [out] = toPlanCells(parsed.output as never);
    expect(out).toMatchObject({ ingredients: [], tags: [], criterionIds: [] });
    expect(out).not.toHaveProperty('orderTip');
  });

  it('mainIngredient는 없어도, null이어도 받고 null·빈 값은 없앤다 (T18)', () => {
    const parsed = v.parse(PlanCellsResultSchema, {
      cells: [
        { ...base, mainIngredient: null },
        { ...base, mainIngredient: '  ' },
        { ...base, mainIngredient: '연어' },
      ],
    });
    const [none, blank, salmon] = toPlanCells(parsed);
    expect(none).not.toHaveProperty('mainIngredient');
    expect(blank).not.toHaveProperty('mainIngredient');
    expect(salmon?.mainIngredient).toBe('연어');
  });

  it('문자열 하나라도 모르는 값이면 여전히 거른다', () => {
    expect(v.safeParse(PlanCellsResultSchema, { cells: [{ ...base, tags: 'spicy' }] }).success).toBe(false);
  });

  it('보통 모양은 그대로 (페르소나 A)', () => {
    const parsed = v.parse(PlanCellsResultSchema, { cells: planA.cells });
    expect(toPlanCells(parsed)).toEqual(planA.cells);
  });
});
