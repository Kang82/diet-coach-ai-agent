// 스펙 4.4 점검과 다시 추천 루프. LLM은 FakePlanGenerator로 바꿔 끼운다.
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { FAKE_USAGE, FakePlanGenerator } from './__fixtures__/fake-plan-generator.ts';
import { checkPlan } from './check-plan.ts';
import {
  createPlan,
  editPlanCells,
  MAX_REGENERATIONS,
  PlanLoopError,
  type CreatePlanInput,
  type PlanContext,
} from './plan-loop.ts';
import type { RegenerateCellsInput } from './plan-generator.ts';
import { QuotaExceededError } from './quota.ts';
import type { Day, MealType, Plan, PlanCell, PlanEvent, Slot } from './types.ts';

const s = (day: Day, meal: MealType): Slot => ({ day, meal });

function ctx(): PlanContext {
  return { profile: structuredClone(profileA), rules: structuredClone(rulesA), classes: structuredClone(classesA) };
}

function weekInput(events: PlanEvent[] = []): CreatePlanInput {
  return { planId: planA.planId, createdAt: planA.createdAt, weekStart: planA.weekStart, events };
}

function cellOf(plan: Plan, day: Day, meal: MealType): PlanCell {
  const found = plan.cells.find((c) => c.day === day && c.meal === meal);
  if (!found) throw new Error(`${day} ${meal} 칸이 없음`);
  return structuredClone(found);
}

/** planA의 한 칸을 고친 복사본 */
function patched(day: Day, meal: MealType, patch: Partial<PlanCell>): PlanCell {
  return { ...cellOf(planA, day, meal), ...patch };
}

/** planA에서 칸 몇 개를 바꾼 식단표. 같은 끼니가 없으면 뒤에 붙인다. */
function planWith(...cells: PlanCell[]): Plan {
  const plan = structuredClone(planA);
  for (const cell of cells) {
    const i = plan.cells.findIndex((c) => c.day === cell.day && c.meal === cell.meal);
    if (i >= 0) plan.cells[i] = cell;
    else plan.cells.push(cell);
  }
  return plan;
}

/** 월요일 아침(skip 끼니)에 넣은 칸 */
const breakfast = (menuId = '토스트') => patched('mon', 'lunch', { meal: 'breakfast', menuId });
const dairyLunch = () => patched('tue', 'lunch', { tags: ['fish', 'dairy'] });

const regenInput = (fake: FakePlanGenerator, i: number) =>
  fake.calls.filter((c) => c.method === 'regenerateCells')[i]!.input as RegenerateCellsInput;

describe('createPlan', () => {
  it('처음 만든 식단표가 통과하면 다시 추천하지 않는다', async () => {
    const fake = new FakePlanGenerator({ plans: [planA.cells] });

    const result = await createPlan(fake, ctx(), weekInput());

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

  it('planId, userId, profileVersion, weekStart, events, createdAt은 LLM이 아니라 입력에서 채운다', async () => {
    const fake = new FakePlanGenerator({ plans: [planA.cells] });
    const profile = { ...structuredClone(profileA), userId: 'user-x', version: 7 };

    const result = await createPlan(fake, { ...ctx(), profile }, {
      planId: 'p-1',
      createdAt: '2026-11-06T09:00:00Z',
      weekStart: '2026-11-16',
      events: [],
    });

    expect(result.ok && { ...result.plan, cells: [] }).toEqual({
      planId: 'p-1',
      userId: 'user-x',
      profileVersion: 7,
      weekStart: '2026-11-16',
      events: [],
      cells: [],
      createdAt: '2026-11-06T09:00:00Z',
    });
  });

  it('일정이 있는 끼니에 LLM이 칸을 넣으면 지우고, 일정은 입력대로 남긴다', async () => {
    const events: PlanEvent[] = [{ day: 'tue', meal: 'dinner', note: '회식' }];
    const fake = new FakePlanGenerator({ plans: [planA.cells] });

    const result = await createPlan(fake, ctx(), weekInput(events));

    const expected = { ...structuredClone(planA), events, cells: planA.cells.filter((c) => !(c.day === 'tue' && c.meal === 'dinner')) };
    expect(result).toMatchObject({ ok: true, plan: expected, regenerations: 0 });
    expect(fake.calls[0]!.input).toMatchObject({ events });
  });

  it('LLM이 돌려준 칸 순서와 관계없이 시간순으로 정리한다', async () => {
    const fake = new FakePlanGenerator({ plans: [[...planA.cells].reverse()] });

    expect(await createPlan(fake, ctx(), weekInput())).toMatchObject({ ok: true, plan: planA });
  });

  describe('unexpected_cell은 코드가 지우고 다시 추천하지 않는다', () => {
    it('채우지 않는 끼니의 칸', async () => {
      const fake = new FakePlanGenerator({ plans: [planWith(breakfast()).cells] });

      expect(await createPlan(fake, ctx(), weekInput())).toMatchObject({ ok: true, plan: planA, regenerations: 0 });
      expect(fake.methods).toEqual(['generatePlan']);
    });

    it('채우지 않는 끼니에 칸이 2개면 둘 다 지운다', async () => {
      const fake = new FakePlanGenerator({ plans: [[...planA.cells, breakfast('토스트'), breakfast('시리얼')]] });

      expect(await createPlan(fake, ctx(), weekInput())).toMatchObject({ ok: true, plan: planA, regenerations: 0 });
    });

    it('같은 끼니에 칸이 겹치면 뒤에 온 칸을 지운다', async () => {
      const fake = new FakePlanGenerator({ plans: [[...planA.cells, patched('tue', 'lunch', { title: '백반 (나물)' })]] });

      const result = await createPlan(fake, ctx(), weekInput());

      expect(result).toMatchObject({ ok: true, plan: planA, regenerations: 0 });
    });

    it('겹친 칸이 앞에 오면 앞의 칸을 남긴다 (checkPlan과 같은 칸)', async () => {
      const first = patched('tue', 'lunch', { title: '백반 (나물)' });
      const fake = new FakePlanGenerator({ plans: [[first, ...planA.cells]] });

      const result = await createPlan(fake, ctx(), weekInput());

      expect(result).toMatchObject({ ok: true, plan: planWith(first), regenerations: 0 });
    });

    it('겹친 칸과 채우지 않는 끼니의 칸이 섞여 있어도 한 번에 지운다', async () => {
      const fake = new FakePlanGenerator({
        plans: [[breakfast(), ...planA.cells, patched('wed', 'dinner', { menuId: '라면' }), breakfast('시리얼')]],
      });

      expect(await createPlan(fake, ctx(), weekInput())).toMatchObject({ ok: true, plan: planA, regenerations: 0 });
    });
  });

  it('위반 칸을 중복 없이 시간순으로 모아 그 칸만 다시 요청하고, 받은 칸으로 바꾼다', async () => {
    // 화요일 점심: avoid_tag + eat_out_not_in_list (같은 칸 두 위반), 수요일 저녁: avoid_tag, 월요일 아침: unexpected_cell
    const generated = planWith(
      patched('wed', 'dinner', { tags: ['fish', 'dairy'] }),
      patched('tue', 'lunch', { menuId: '짜장면', tags: ['wheat', 'dairy'] }),
      breakfast(),
    );
    const fake = new FakePlanGenerator({
      plans: [generated.cells],
      regenerations: [[cellOf(planA, 'tue', 'lunch'), cellOf(planA, 'wed', 'dinner')]],
    });

    const result = await createPlan(fake, ctx(), weekInput());

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
    const fake = new FakePlanGenerator({
      plans: [planWith(dairyLunch()).cells],
      regenerations: [
        [patched('mon', 'dinner', { menuId: '라면' })], // 요청하지 않은 칸만 돌아옴
        [cellOf(planA, 'tue', 'lunch')],
      ],
    });

    const result = await createPlan(fake, ctx(), weekInput());

    expect(regenInput(fake, 1).targets).toEqual([s('tue', 'lunch')]);
    expect(regenInput(fake, 1).violations.map((v) => v.rule)).toEqual(['missing_cell']);
    expect(result).toMatchObject({ ok: true, plan: planA, regenerations: 2 });
  });

  it('한 칸에 여러 개가 돌아오면 첫 칸만 쓴다', async () => {
    const fake = new FakePlanGenerator({
      plans: [planWith(dairyLunch()).cells],
      regenerations: [[cellOf(planA, 'tue', 'lunch'), patched('tue', 'lunch', { menuId: '쌀국수' })]],
    });

    expect(await createPlan(fake, ctx(), weekInput())).toMatchObject({ ok: true, plan: planA, regenerations: 1 });
  });

  it(`${MAX_REGENERATIONS}회 다시 추천해도 위반이 남으면 식단표 없이 마지막 위반을 돌려준다`, async () => {
    const fake = new FakePlanGenerator({
      plans: [planWith(dairyLunch()).cells],
      regenerations: [[dairyLunch()], [dairyLunch()], [dairyLunch()]],
    });

    const result = await createPlan(fake, ctx(), weekInput());

    expect(result).toEqual({
      ok: false,
      reason: 'violations',
      check: checkPlan(planWith(dairyLunch()), profileA, classesA, rulesA),
      lastPlan: planWith(dairyLunch()),
      usages: [FAKE_USAGE, FAKE_USAGE, FAKE_USAGE, FAKE_USAGE],
      regenerations: MAX_REGENERATIONS,
    });
    expect(result).not.toHaveProperty('plan');
    expect(fake.methods).toEqual(['generatePlan', 'regenerateCells', 'regenerateCells', 'regenerateCells']);
  });

  it('마지막 회차에 통과하면 성공이다', async () => {
    const fake = new FakePlanGenerator({
      plans: [planWith(dairyLunch()).cells],
      regenerations: [[dairyLunch()], [dairyLunch()], [cellOf(planA, 'tue', 'lunch')]],
    });

    expect(await createPlan(fake, ctx(), weekInput())).toMatchObject({ ok: true, plan: planA, regenerations: 3 });
  });

  it('다시 추천할 칸이 없는 위반이 남으면 회차가 남아도 LLM을 부르지 않고 실패한다', async () => {
    // 지금 규칙으로는 생기지 않는 상황이라, 음수 제한으로 regenerate가 빈 tag_weekly_limit 위반을 만든다.
    const rules = { ...structuredClone(rulesA), tagLimits: { ...rulesA.tagLimits, processed_meat: -1 } };
    const fake = new FakePlanGenerator({ plans: [planA.cells] });

    const result = await createPlan(fake, { ...ctx(), rules }, weekInput());

    expect(result).toMatchObject({ ok: false, reason: 'violations', regenerations: 0 });
    expect(result.ok === false && result.reason === 'violations' && result.check.violations).toEqual([
      { rule: 'tag_weekly_limit', cells: [], regenerate: [], detail: 'processed_meat' },
    ]);
    expect(fake.methods).toEqual(['generatePlan']);
  });

  describe('한도 초과가 아닌 LLM 에러', () => {
    it('처음 만들 때 실패하면 원래 에러를 cause로 둔 PlanLoopError를 던진다', async () => {
      const cause = new Error('스키마 검증 실패');
      const fake = new FakePlanGenerator({ plans: [cause] });

      const error = await createPlan(fake, ctx(), weekInput()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(PlanLoopError);
      expect(error).toMatchObject({ cause, usages: [], regenerations: 0 });
    });

    it('다시 추천 중에 실패하면 그때까지 쓴 사용량을 붙여 던진다', async () => {
      const fake = new FakePlanGenerator({
        plans: [planWith(dairyLunch()).cells],
        regenerations: [[dairyLunch()], new Error('네트워크 오류')],
      });

      const error = await createPlan(fake, ctx(), weekInput()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(PlanLoopError);
      expect(error).toMatchObject({ usages: [FAKE_USAGE, FAKE_USAGE], regenerations: 1 });
      expect((error as Error).message).toContain('네트워크 오류');
    });
  });
});

describe('editPlanCells', () => {
  const request = '점심을 다른 걸로 바꿔 줘';
  const edit = (fake: FakePlanGenerator, targets: Slot[], plan: Plan = structuredClone(planA)) =>
    editPlanCells(fake, ctx(), plan, { targets, userRequest: request });

  it('요청한 칸만 사용자 요청과 함께 다시 추천해 바꾼다', async () => {
    const replaced = patched('tue', 'lunch', { title: '백반 (나물 반찬)' });
    const fake = new FakePlanGenerator({ regenerations: [[replaced]] });
    const plan = structuredClone(planA);

    const result = await edit(fake, [s('tue', 'lunch')], plan);

    expect(fake.calls).toEqual([
      {
        method: 'regenerateCells',
        input: { ...ctx(), plan: planA, targets: [s('tue', 'lunch')], violations: [], userRequest: request },
      },
    ]);
    expect(result).toMatchObject({ ok: true, plan: planWith(replaced) });
    expect(plan).toEqual(planA); // 입력은 고치지 않는다
  });

  it('바꾼 칸만 달라지면 changed에 그 칸만 있다', async () => {
    const replaced = patched('tue', 'lunch', { title: '백반 (나물 반찬)' });
    const fake = new FakePlanGenerator({ regenerations: [[replaced]] });

    const result = await edit(fake, [s('tue', 'lunch')]);

    expect(result).toMatchObject({
      ok: true,
      plan: planWith(replaced),
      changed: [s('tue', 'lunch')],
      unchangedTargets: [s('tue', 'lunch')], // 메뉴(백반)는 그대로
      usages: [FAKE_USAGE],
      regenerations: 1,
    });
  });

  it('바꾼 칸 때문에 다른 칸이 위반되면 사용자 요청 없이 그 칸을 고치고, changed에 함께 알린다', async () => {
    // 화요일 점심을 쌀국수로 → 수요일 점심 쌀국수와 same_meal_consecutive_days → 뒤 칸(수요일 점심)을 다시 추천
    const tueLunch = patched('tue', 'lunch', { menuId: '쌀국수', title: '쌀국수' });
    const wedLunch = patched('wed', 'lunch', { menuId: '백반', title: '백반', tags: ['fish'] });
    const fake = new FakePlanGenerator({ regenerations: [[tueLunch], [wedLunch]] });

    const result = await edit(fake, [s('tue', 'lunch')]);

    const second = regenInput(fake, 1);
    expect(second.targets).toEqual([s('wed', 'lunch')]);
    expect(second.violations.map((v) => v.rule)).toEqual(['same_meal_consecutive_days']);
    expect(second).not.toHaveProperty('userRequest');
    expect(result).toMatchObject({
      ok: true,
      plan: planWith(tueLunch, wedLunch),
      changed: [s('tue', 'lunch'), s('wed', 'lunch')],
      unchangedTargets: [],
      regenerations: 2,
    });
  });

  it('사용자가 고른 칸이 다시 대상이 되면 사용자 요청도 함께 보낸다', async () => {
    const fake = new FakePlanGenerator({ regenerations: [[dairyLunch()], [cellOf(planA, 'tue', 'lunch')]] });

    const result = await edit(fake, [s('tue', 'lunch')]);

    expect(regenInput(fake, 1)).toMatchObject({ targets: [s('tue', 'lunch')], userRequest: request });
    // LLM이 원래 메뉴로 되돌린 경우: 성공이지만 바뀐 칸이 없고, 요청한 칸이 그대로라고 알린다
    expect(result).toMatchObject({ ok: true, plan: planA, changed: [], unchangedTargets: [s('tue', 'lunch')] });
  });

  it(`사용자 요청을 포함해 ${MAX_REGENERATIONS}회 안에 통과하지 못하면 수정 전 식단표를 그대로 둔다`, async () => {
    const fake = new FakePlanGenerator({ regenerations: [[dairyLunch()], [dairyLunch()], [dairyLunch()]] });
    const plan = structuredClone(planA);

    const result = await edit(fake, [s('tue', 'lunch')], plan);

    expect(result).toEqual({
      ok: false,
      reason: 'violations',
      plan: planA,
      check: checkPlan(planWith(dairyLunch()), profileA, classesA, rulesA),
      usages: [FAKE_USAGE, FAKE_USAGE, FAKE_USAGE],
      regenerations: MAX_REGENERATIONS,
    });
    for (const i of [1, 2]) {
      expect(regenInput(fake, i)).toMatchObject({
        targets: [s('tue', 'lunch')],
        violations: [{ rule: 'avoid_tag', cells: [s('tue', 'lunch')], regenerate: [s('tue', 'lunch')], detail: 'dairy' }],
        userRequest: request,
      });
    }
    expect(plan).toEqual(planA);
  });

  it('요청한 칸이 겹치면 한 번만 보낸다', async () => {
    const fake = new FakePlanGenerator({ regenerations: [[cellOf(planA, 'tue', 'lunch'), cellOf(planA, 'mon', 'lunch')]] });

    await edit(fake, [s('tue', 'lunch'), s('mon', 'lunch'), s('tue', 'lunch')]);

    expect(regenInput(fake, 0).targets).toEqual([s('mon', 'lunch'), s('tue', 'lunch')]);
  });

  describe('고를 수 없는 칸이면 LLM을 부르지 않고 거절한다', () => {
    it('채우지 않는 끼니', async () => {
      const fake = new FakePlanGenerator({});

      const result = await edit(fake, [s('tue', 'lunch'), s('mon', 'breakfast')]);

      expect(result).toEqual({
        ok: false,
        reason: 'invalid_targets',
        plan: planA,
        invalidTargets: [s('mon', 'breakfast')],
        usages: [],
        regenerations: 0,
      });
      expect(fake.calls).toEqual([]);
    });

    it('일정이 있는 끼니', async () => {
      const plan = { ...structuredClone(planA), events: [{ day: 'tue' as const, meal: 'dinner' as const, note: '회식' }] };
      plan.cells = plan.cells.filter((c) => !(c.day === 'tue' && c.meal === 'dinner'));
      const fake = new FakePlanGenerator({});

      const result = await edit(fake, [s('tue', 'dinner')], plan);

      expect(result).toMatchObject({ ok: false, reason: 'invalid_targets', invalidTargets: [s('tue', 'dinner')] });
      expect(fake.calls).toEqual([]);
    });

    it('빈 요청', async () => {
      const fake = new FakePlanGenerator({});

      expect(await edit(fake, [])).toMatchObject({ ok: false, reason: 'invalid_targets', invalidTargets: [] });
      expect(fake.calls).toEqual([]);
    });
  });

  it('LLM 에러는 사용량을 붙인 PlanLoopError로 던진다', async () => {
    const fake = new FakePlanGenerator({ regenerations: [[dairyLunch()], new Error('네트워크 오류')] });

    const error = await edit(fake, [s('tue', 'lunch')]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlanLoopError);
    expect(error).toMatchObject({ usages: [FAKE_USAGE], regenerations: 1 });
  });
});

// 스펙 11.3-1, 2: 한도 초과는 재요청하지 않고 즉시 멈춘다. 재시도 횟수로 세지 않는다.
describe('한도 초과', () => {
  it('처음 만들 때 한도 초과면 바로 멈춘다', async () => {
    const fake = new FakePlanGenerator({ plans: [new QuotaExceededError()] });

    expect(await createPlan(fake, ctx(), weekInput())).toEqual({
      ok: false,
      reason: 'quota',
      usages: [],
      regenerations: 0,
    });
    expect(fake.methods).toEqual(['generatePlan']);
  });

  it('다시 추천 중에 한도 초과면 남은 회차를 쓰지 않고 멈추고, 실패한 호출은 세지 않는다', async () => {
    const fake = new FakePlanGenerator({
      plans: [planWith(dairyLunch()).cells],
      regenerations: [[dairyLunch()], new QuotaExceededError(), [cellOf(planA, 'tue', 'lunch')]],
    });

    const result = await createPlan(fake, ctx(), weekInput());

    expect(result).toEqual({ ok: false, reason: 'quota', usages: [FAKE_USAGE, FAKE_USAGE], regenerations: 1 });
    expect(fake.methods).toEqual(['generatePlan', 'regenerateCells', 'regenerateCells']);
  });

  it('칸 수정 중 한도 초과면 수정 전 식단표를 그대로 돌려준다', async () => {
    const fake = new FakePlanGenerator({ regenerations: [[dairyLunch()], new QuotaExceededError()] });
    const plan = structuredClone(planA);

    const result = await editPlanCells(fake, ctx(), plan, {
      targets: [s('tue', 'lunch')],
      userRequest: '점심을 다른 걸로 바꿔 줘',
    });

    expect(result).toEqual({ ok: false, reason: 'quota', plan: planA, usages: [FAKE_USAGE], regenerations: 1 });
    expect(plan).toEqual(planA);
  });

  it('칸 수정의 첫 호출에서 한도 초과여도 수정 전 식단표를 돌려준다', async () => {
    const fake = new FakePlanGenerator({ regenerations: [new QuotaExceededError()] });

    const result = await editPlanCells(fake, ctx(), structuredClone(planA), {
      targets: [s('tue', 'lunch')],
      userRequest: '점심을 다른 걸로 바꿔 줘',
    });

    expect(result).toEqual({ ok: false, reason: 'quota', plan: planA, usages: [], regenerations: 0 });
  });
});
