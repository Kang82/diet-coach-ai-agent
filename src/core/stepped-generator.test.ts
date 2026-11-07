// B12(T8-3). durable 도구의 step으로 감싼 생성기. 기록이 있는 호출은 다시 부르지 않는다.
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { FAKE_USAGE, FakePlanGenerator } from './__fixtures__/fake-plan-generator.ts';
import { createPlan, type CreatePlanInput, type PlanContext } from './plan-loop.ts';
import type { GeneratePlanInput } from './plan-generator.ts';
import { QuotaExceededError } from './quota.ts';
import { steppedGenerator, type StepRunner } from './stepped-generator.ts';
import type { PlanCell } from './types.ts';

/** Flue step처럼 이름마다 값을 JSON으로 기록한다. 같은 records로 새로 만들면 복구 뒤 재실행이다 */
function memoStep(records = new Map<string, unknown>()): StepRunner & { records: Map<string, unknown>; names: string[] } {
  const names: string[] = [];
  return {
    records,
    names,
    async do<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
      if (names.includes(name)) throw new Error(`같은 step 이름 두 번: ${name}`);
      names.push(name);
      if (records.has(name)) return structuredClone(records.get(name)) as T;
      const value = JSON.parse(JSON.stringify(await fn())) as T;
      records.set(name, value);
      return structuredClone(value);
    },
  };
}

function ctx(): PlanContext {
  return { profile: structuredClone(profileA), rules: structuredClone(rulesA), classes: structuredClone(classesA) };
}

const weekInput = (): CreatePlanInput => ({ planId: planA.planId, createdAt: planA.createdAt, weekStart: planA.weekStart, events: [] });

const genInput = (): GeneratePlanInput => ({ ...ctx(), weekStart: planA.weekStart, events: [] });

const tueLunch = () => structuredClone(planA.cells.find((c) => c.day === 'tue' && c.meal === 'lunch')!);

/** 화요일 점심에 유제품 태그를 넣어 위반 1칸이 나는 1주일 칸 */
function cellsWithViolation(): PlanCell[] {
  return planA.cells.map((c) => (c.day === 'tue' && c.meal === 'lunch' ? { ...c, tags: ['fish', 'dairy'] } : structuredClone(c)));
}

describe('steppedGenerator', () => {
  it('호출 순서대로 llm:1, llm:2 이름으로 기록하고 입력과 옵션을 그대로 넘긴다', async () => {
    const fake = new FakePlanGenerator({ plans: [planA.cells], regenerations: [[tueLunch()]] });
    const step = memoStep();
    const gen = steppedGenerator(fake, step);

    await gen.generatePlan(genInput(), { limitMs: 1000 });
    await gen.regenerateCells(
      { plan: structuredClone(planA), targets: [{ day: 'tue', meal: 'lunch' }], violations: [], ...ctx() },
      { limitMs: 500 },
    );

    expect(step.names).toEqual(['llm:1', 'llm:2']);
    expect(fake.calls.map((c) => [c.method, c.options])).toEqual([
      ['generatePlan', { limitMs: 1000 }],
      ['regenerateCells', { limitMs: 500 }],
    ]);
    expect(fake.calls[0]!.input).toEqual(genInput());
    expect(step.records.get('llm:1')).toEqual({ value: planA.cells, usage: FAKE_USAGE });
  });

  it('복구: 기록된 호출은 안쪽 생성기를 부르지 않고 기록값을 돌려준다', async () => {
    const first = memoStep();
    await steppedGenerator(new FakePlanGenerator({ plans: [planA.cells] }), first).generatePlan(genInput());

    const fake = new FakePlanGenerator({ regenerations: [[tueLunch()]] });
    const gen = steppedGenerator(fake, memoStep(first.records));
    const replayed = await gen.generatePlan(genInput());
    const fresh = await gen.regenerateCells({
      plan: structuredClone(planA),
      targets: [{ day: 'tue', meal: 'lunch' }],
      violations: [],
      ...ctx(),
    });

    expect(replayed).toEqual({ value: planA.cells, usage: FAKE_USAGE });
    expect(fake.methods).toEqual(['regenerateCells']);
    expect(fresh.value).toEqual([tueLunch()]);
  });

  it('안쪽이 던지면 기록하지 않고 같은 에러를 그대로 던진다', async () => {
    const quota = new QuotaExceededError();
    const step = memoStep();
    const gen = steppedGenerator(new FakePlanGenerator({ plans: [quota] }), step);

    const error = await gen.generatePlan(genInput()).catch((e: unknown) => e);

    expect(error).toBe(quota);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(step.records.size).toBe(0);
  });

  it('createPlan을 같은 기록으로 다시 돌리면 LLM을 부르지 않고 같은 식단표가 나온다', async () => {
    const step = memoStep();
    const fake = new FakePlanGenerator({ plans: [cellsWithViolation()], regenerations: [[tueLunch()]] });
    const first = await createPlan(steppedGenerator(fake, step), ctx(), weekInput());

    const again = new FakePlanGenerator({});
    const second = await createPlan(steppedGenerator(again, memoStep(step.records)), ctx(), weekInput());

    expect(first).toMatchObject({ ok: true, regenerations: 1 });
    expect(fake.methods).toEqual(['generatePlan', 'regenerateCells']);
    expect(again.calls).toEqual([]);
    expect(second).toEqual(first);
  });
});
