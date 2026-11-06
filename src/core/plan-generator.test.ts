// 스펙 4.3, 4.4의 LLM 포트. 루프 테스트(T1-3)가 기대는 가짜 구현의 동작을 확인한다.
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { FAKE_USAGE, FakePlanGenerator } from './__fixtures__/fake-plan-generator.ts';
import type { GeneratePlanInput, RegenerateCellsInput } from './plan-generator.ts';

function generateInput(): GeneratePlanInput {
  return {
    profile: structuredClone(profileA),
    rules: structuredClone(rulesA),
    classes: structuredClone(classesA),
    weekStart: planA.weekStart,
    events: [],
  };
}

function regenerateInput(): RegenerateCellsInput {
  return {
    plan: structuredClone(planA),
    targets: [{ day: 'tue', meal: 'lunch' }],
    violations: [],
    profile: structuredClone(profileA),
    rules: structuredClone(rulesA),
    classes: structuredClone(classesA),
  };
}

describe('FakePlanGenerator', () => {
  it('정해 둔 응답을 순서대로 돌려주고 사용량을 붙인다', async () => {
    const cell = planA.cells[0]!;
    const fake = new FakePlanGenerator({ plans: [planA], regenerations: [[cell], []] });

    expect(await fake.generatePlan(generateInput())).toEqual({ value: planA, usage: FAKE_USAGE });
    expect(await fake.regenerateCells(regenerateInput())).toEqual({ value: [cell], usage: FAKE_USAGE });
    expect(await fake.regenerateCells(regenerateInput())).toEqual({ value: [], usage: FAKE_USAGE });
  });

  it('호출 순서와 인자를 기록한다', async () => {
    const fake = new FakePlanGenerator({ plans: [planA], regenerations: [[]] });
    const gen = generateInput();
    const regen = regenerateInput();

    await fake.generatePlan(gen);
    await fake.regenerateCells(regen);

    expect(fake.methods).toEqual(['generatePlan', 'regenerateCells']);
    expect(fake.calls).toEqual([
      { method: 'generatePlan', input: gen },
      { method: 'regenerateCells', input: regen },
    ]);
  });

  it('기록한 인자는 호출 뒤에 원본을 고쳐도 바뀌지 않는다', async () => {
    const fake = new FakePlanGenerator({ regenerations: [[]] });
    const regen = regenerateInput();

    await fake.regenerateCells(regen);
    regen.targets.push({ day: 'wed', meal: 'lunch' });
    regen.plan.cells = [];

    const recorded = fake.calls[0]!.input as RegenerateCellsInput;
    expect(recorded.targets).toEqual([{ day: 'tue', meal: 'lunch' }]);
    expect(recorded.plan.cells).toHaveLength(planA.cells.length);
  });

  it('돌려준 값을 고쳐도 정해 둔 원본은 그대로다', async () => {
    const fake = new FakePlanGenerator({ plans: [planA] });

    const { value } = await fake.generatePlan(generateInput());
    value.cells = [];

    expect(planA.cells.length).toBeGreaterThan(0);
  });

  it('함수 응답은 입력을 받아 값을 만든다', async () => {
    const fake = new FakePlanGenerator({
      regenerations: [(input) => planA.cells.filter((c) => input.targets.some((t) => t.day === c.day && t.meal === c.meal))],
    });

    const { value } = await fake.regenerateCells(regenerateInput());

    expect(value.map((c) => [c.day, c.meal])).toEqual([['tue', 'lunch']]);
  });

  it('에러 응답은 그대로 던지고, 그 호출도 기록한다', async () => {
    const error = new Error('한도 초과');
    const fake = new FakePlanGenerator({ plans: [error] });

    await expect(fake.generatePlan(generateInput())).rejects.toBe(error);
    expect(fake.methods).toEqual(['generatePlan']);
  });

  it('정해 둔 응답이 떨어지면 에러를 던진다', async () => {
    const fake = new FakePlanGenerator({ plans: [planA] });
    await fake.generatePlan(generateInput());

    await expect(fake.generatePlan(generateInput())).rejects.toThrow('generatePlan 응답을 더 정해 두지 않음');
  });

  it('사용량을 바꿔 줄 수 있다', async () => {
    const usage = { model: 'cloudflare/@cf/google/gemma-4-26b-a4b-it', input: 1648, output: 6226 };
    const fake = new FakePlanGenerator({ plans: [planA], usage });

    expect((await fake.generatePlan(generateInput())).usage).toEqual(usage);
  });
});
