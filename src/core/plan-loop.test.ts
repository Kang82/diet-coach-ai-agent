// 스펙 4.4 점검과 다시 추천 루프. LLM은 FakePlanGenerator로 바꿔 끼운다.
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { FAKE_USAGE, FakePlanGenerator } from './__fixtures__/fake-plan-generator.ts';
import { checkPlan } from './check-plan.ts';
import { createPlan, editPlanCells, MAX_REGENERATIONS, type PlanContext } from './plan-loop.ts';
import type { RegenerateCellsInput } from './plan-generator.ts';
import type { Day, MealType, Plan, PlanCell, Slot } from './types.ts';

const s = (day: Day, meal: MealType): Slot => ({ day, meal });

function ctx(): PlanContext {
  return { profile: structuredClone(profileA), rules: structuredClone(rulesA), classes: structuredClone(classesA) };
}

const weekInput = { weekStart: planA.weekStart, events: [] };

function cellOf(plan: Plan, day: Day, meal: MealType): PlanCell {
  const found = plan.cells.find((c) => c.day === day && c.meal === meal);
  if (!found) throw new Error(`${day} ${meal} 칸이 없음`);
  return structuredClone(found);
}

/** planA의 한 칸을 고친 복사본 */
function patched(day: Day, meal: MealType, patch: Partial<PlanCell>): PlanCell {
  return { ...cellOf(planA, day, meal), ...patch };
}

/** planA에서 칸 몇 개를 바꾼 식단표 */
function planWith(...cells: PlanCell[]): Plan {
  const plan = structuredClone(planA);
  for (const cell of cells) {
    const i = plan.cells.findIndex((c) => c.day === cell.day && c.meal === cell.meal);
    if (i >= 0) plan.cells[i] = cell;
    else plan.cells.push(cell);
  }
  return plan;
}

const regenInput = (fake: FakePlanGenerator, i: number) =>
  fake.calls.filter((c) => c.method === 'regenerateCells')[i]!.input as RegenerateCellsInput;

describe('createPlan', () => {
  it('처음 만든 식단표가 통과하면 다시 추천하지 않는다', async () => {
    const fake = new FakePlanGenerator({ plans: [planA] });

    const result = await createPlan(fake, ctx(), weekInput);

    expect(result).toEqual({
      ok: true,
      plan: planA,
      check: checkPlan(planA, profileA, classesA, rulesA),
      usages: [FAKE_USAGE],
      regenerations: 0,
    });
    expect(fake.calls).toEqual([
      { method: 'generatePlan', input: { ...ctx(), weekStart: planA.weekStart, events: [] } },
    ]);
  });

  it('unexpected_cell 칸은 코드가 지우고 다시 추천하지 않는다', async () => {
    const extra = patched('mon', 'lunch', { meal: 'breakfast', menuId: '토스트' });
    const fake = new FakePlanGenerator({ plans: [planWith(extra)] });

    const result = await createPlan(fake, ctx(), weekInput);

    expect(result.ok && result.plan).toEqual(planA);
    expect(fake.methods).toEqual(['generatePlan']);
  });

  it('같은 끼니에 칸이 겹치면 앞의 칸을 남기고 뒤의 칸을 지운다', async () => {
    const generated = structuredClone(planA);
    generated.cells.push(patched('tue', 'lunch', { menuId: '쌀국수' }));
    const fake = new FakePlanGenerator({ plans: [generated] });

    const result = await createPlan(fake, ctx(), weekInput);

    expect(result.ok && cellOf(result.plan, 'tue', 'lunch').menuId).toBe('백반');
    expect(result.ok && result.plan.cells).toHaveLength(planA.cells.length);
    expect(fake.methods).toEqual(['generatePlan']);
  });

  it('위반 칸을 중복 없이 시간순으로 모아 그 칸만 다시 요청하고, 받은 칸으로 바꾼다', async () => {
    // 화요일 점심: avoid_tag + eat_out_not_in_list (같은 칸 두 위반), 수요일 저녁: avoid_tag, 월요일 아침: unexpected_cell
    const generated = planWith(
      patched('wed', 'dinner', { tags: ['fish', 'dairy'] }),
      patched('tue', 'lunch', { menuId: '짜장면', tags: ['wheat', 'dairy'] }),
      patched('mon', 'lunch', { meal: 'breakfast', menuId: '토스트' }),
    );
    const fake = new FakePlanGenerator({
      plans: [generated],
      regenerations: [[cellOf(planA, 'tue', 'lunch'), cellOf(planA, 'wed', 'dinner')]],
    });

    const result = await createPlan(fake, ctx(), weekInput);

    // 다시 추천에 보낸 식단표에는 지운 칸이 없다
    const sent = planWith(
      patched('wed', 'dinner', { tags: ['fish', 'dairy'] }),
      patched('tue', 'lunch', { menuId: '짜장면', tags: ['wheat', 'dairy'] }),
    );
    expect(fake.calls[1]).toEqual({
      method: 'regenerateCells',
      input: {
        ...ctx(),
        plan: sent,
        targets: [s('tue', 'lunch'), s('wed', 'dinner')],
        violations: checkPlan(sent, profileA, classesA, rulesA).violations,
      },
    });
    expect(result).toMatchObject({ ok: true, plan: planA, usages: [FAKE_USAGE, FAKE_USAGE], regenerations: 1 });
  });

  it('요청하지 않은 칸은 버리고, 돌아오지 않은 칸은 missing_cell로 다음 회차에 다시 요청한다', async () => {
    const generated = planWith(patched('tue', 'lunch', { tags: ['fish', 'dairy'] }));
    const fake = new FakePlanGenerator({
      plans: [generated],
      regenerations: [
        [patched('mon', 'dinner', { menuId: '라면' })], // 요청하지 않은 칸만 돌아옴
        [cellOf(planA, 'tue', 'lunch')],
      ],
    });

    const result = await createPlan(fake, ctx(), weekInput);

    expect(regenInput(fake, 1).targets).toEqual([s('tue', 'lunch')]);
    expect(regenInput(fake, 1).violations.map((v) => v.rule)).toEqual(['missing_cell']);
    expect(result).toMatchObject({ ok: true, plan: planA, regenerations: 2 });
  });

  it('한 칸에 여러 개가 돌아오면 첫 칸만 쓴다', async () => {
    const generated = planWith(patched('tue', 'lunch', { tags: ['fish', 'dairy'] }));
    const fake = new FakePlanGenerator({
      plans: [generated],
      regenerations: [[cellOf(planA, 'tue', 'lunch'), patched('tue', 'lunch', { menuId: '쌀국수' })]],
    });

    const result = await createPlan(fake, ctx(), weekInput);

    expect(result).toMatchObject({ ok: true, plan: planA, regenerations: 1 });
  });

  it(`${MAX_REGENERATIONS}회 다시 추천해도 위반이 남으면 식단표 없이 마지막 위반을 돌려준다`, async () => {
    const bad = patched('tue', 'lunch', { tags: ['fish', 'dairy'] });
    const fake = new FakePlanGenerator({ plans: [planWith(bad)], regenerations: [[bad], [bad], [bad]] });

    const result = await createPlan(fake, ctx(), weekInput);

    expect(result).toEqual({
      ok: false,
      reason: 'violations',
      check: checkPlan(planWith(bad), profileA, classesA, rulesA),
      usages: [FAKE_USAGE, FAKE_USAGE, FAKE_USAGE, FAKE_USAGE],
      regenerations: MAX_REGENERATIONS,
    });
    expect(result).not.toHaveProperty('plan');
    expect(fake.methods).toEqual(['generatePlan', 'regenerateCells', 'regenerateCells', 'regenerateCells']);
  });

  it('마지막 회차에 통과하면 성공이다', async () => {
    const bad = patched('tue', 'lunch', { tags: ['fish', 'dairy'] });
    const fake = new FakePlanGenerator({
      plans: [planWith(bad)],
      regenerations: [[bad], [bad], [cellOf(planA, 'tue', 'lunch')]],
    });

    expect(await createPlan(fake, ctx(), weekInput)).toMatchObject({ ok: true, plan: planA, regenerations: 3 });
  });

  it('LLM 에러는 그대로 던진다', async () => {
    const fake = new FakePlanGenerator({ plans: [new Error('스키마 검증 실패')] });

    await expect(createPlan(fake, ctx(), weekInput)).rejects.toThrow('스키마 검증 실패');
  });
});

describe('editPlanCells', () => {
  const request = '점심을 다른 걸로 바꿔 줘';

  it('요청한 칸만 사용자 요청과 함께 다시 추천해 바꾼다', async () => {
    const replaced = patched('tue', 'lunch', { title: '백반 (나물 반찬)' });
    const fake = new FakePlanGenerator({ regenerations: [[replaced]] });
    const plan = structuredClone(planA);

    const result = await editPlanCells(fake, ctx(), plan, { targets: [s('tue', 'lunch')], userRequest: request });

    expect(fake.calls).toEqual([
      {
        method: 'regenerateCells',
        input: { ...ctx(), plan: planA, targets: [s('tue', 'lunch')], violations: [], userRequest: request },
      },
    ]);
    expect(result).toMatchObject({ ok: true, plan: planWith(replaced), usages: [FAKE_USAGE], regenerations: 1 });
    expect(plan).toEqual(planA); // 입력은 고치지 않는다
  });

  it('바꾼 칸 때문에 생긴 위반은 다음 회차에 사용자 요청 없이 고친다', async () => {
    // 화요일 점심을 쌀국수로 → 수요일 점심 쌀국수와 same_meal_consecutive_days → 뒤 칸(수요일 점심)을 다시 추천
    const tueLunch = patched('tue', 'lunch', { menuId: '쌀국수', title: '쌀국수' });
    const wedLunch = patched('wed', 'lunch', { menuId: '백반', title: '백반', tags: ['fish'] });
    const fake = new FakePlanGenerator({ regenerations: [[tueLunch], [wedLunch]] });

    const result = await editPlanCells(fake, ctx(), structuredClone(planA), {
      targets: [s('tue', 'lunch')],
      userRequest: request,
    });

    const second = regenInput(fake, 1);
    expect(second.targets).toEqual([s('wed', 'lunch')]);
    expect(second.violations.map((v) => v.rule)).toEqual(['same_meal_consecutive_days']);
    expect(second).not.toHaveProperty('userRequest');
    expect(result).toMatchObject({ ok: true, plan: planWith(tueLunch, wedLunch), regenerations: 2 });
  });

  it(`사용자 요청을 포함해 ${MAX_REGENERATIONS}회 안에 통과하지 못하면 수정 전 식단표를 그대로 둔다`, async () => {
    const bad = patched('tue', 'lunch', { tags: ['fish', 'dairy'] });
    const fake = new FakePlanGenerator({ regenerations: [[bad], [bad], [bad]] });
    const plan = structuredClone(planA);

    const result = await editPlanCells(fake, ctx(), plan, { targets: [s('tue', 'lunch')], userRequest: request });

    expect(result).toEqual({
      ok: false,
      reason: 'violations',
      plan: planA,
      check: checkPlan(planWith(bad), profileA, classesA, rulesA),
      usages: [FAKE_USAGE, FAKE_USAGE, FAKE_USAGE],
      regenerations: MAX_REGENERATIONS,
    });
    expect(plan).toEqual(planA);
  });

  it('요청한 칸이 겹치면 한 번만 보낸다', async () => {
    const fake = new FakePlanGenerator({ regenerations: [[cellOf(planA, 'tue', 'lunch'), cellOf(planA, 'mon', 'lunch')]] });

    await editPlanCells(fake, ctx(), structuredClone(planA), {
      targets: [s('tue', 'lunch'), s('mon', 'lunch'), s('tue', 'lunch')],
      userRequest: request,
    });

    expect(regenInput(fake, 0).targets).toEqual([s('mon', 'lunch'), s('tue', 'lunch')]);
  });
});
