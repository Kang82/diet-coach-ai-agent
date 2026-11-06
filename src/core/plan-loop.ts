// 스펙 4.4 점검과 다시 추천 루프.
// LLM은 PlanGenerator 포트로만 부른다. 입력 식단표는 고치지 않고 새 객체를 만든다.
import { checkPlan } from './check-plan.ts';
import { compareSlots, sameSlot, slotOrder, toSlot } from './helpers.ts';
import type { LlmResult, PlanGenerator, TokenUsage } from './plan-generator.ts';
import type {
  CheckResult,
  CriteriaRules,
  MenuClassification,
  Plan,
  PlanCell,
  PlanEvent,
  Profile,
  Slot,
} from './types.ts';

/** regenerateCells를 부를 수 있는 최대 횟수 (스펙 4.4-3). 늘리지 않는다 (11.2). */
export const MAX_REGENERATIONS = 3;

export interface PlanContext {
  profile: Profile;
  rules: CriteriaRules;
  classes: MenuClassification[];
}

interface LoopStats {
  /** 이번 루프에서 부른 LLM 호출의 사용량, 호출 순서대로 */
  usages: TokenUsage[];
  /** regenerateCells를 부른 횟수 */
  regenerations: number;
}

export type CreatePlanResult =
  | ({ ok: true; plan: Plan; check: CheckResult } & LoopStats)
  /** 식단표를 보여 주지 않는다. check는 마지막 시도의 점검 결과로, 위반 원인을 알리는 데 쓴다. */
  | ({ ok: false; reason: 'violations'; check: CheckResult } & LoopStats);

export type EditPlanResult =
  | ({ ok: true; plan: Plan; check: CheckResult } & LoopStats)
  /** plan은 수정 전 식단표 그대로다. check는 마지막 시도의 점검 결과. */
  | ({ ok: false; reason: 'violations'; plan: Plan; check: CheckResult } & LoopStats);

/** 1주일 식단표를 만들고 점검·다시 추천한다 (스펙 4.4-1~3). */
export async function createPlan(
  generator: PlanGenerator,
  ctx: PlanContext,
  input: { weekStart: string; events: PlanEvent[] },
): Promise<CreatePlanResult> {
  const usages: TokenUsage[] = [];
  const generated = await generator.generatePlan({ ...ctx, weekStart: input.weekStart, events: input.events });
  usages.push(generated.usage);

  const result = await repair(generator, ctx, generated.value, usages, 0);
  if (result.ok) return result;
  return { ok: false, reason: 'violations', check: result.check, usages, regenerations: result.regenerations };
}

/**
 * 사용자가 고른 칸을 다시 추천한다 (스펙 4.4-4).
 * 요청한 칸을 바꾼 뒤 생긴 위반은 같은 루프로 고치고, 3회 안에 통과하지 못하면 수정 전 식단표를 돌려준다.
 */
export async function editPlanCells(
  generator: PlanGenerator,
  ctx: PlanContext,
  plan: Plan,
  input: { targets: Slot[]; userRequest: string },
): Promise<EditPlanResult> {
  const original = structuredClone(plan);
  const targets = uniqueSlots(input.targets);
  const usages: TokenUsage[] = [];

  const first = await generator.regenerateCells({
    ...ctx,
    plan: structuredClone(plan),
    targets,
    violations: [],
    userRequest: input.userRequest,
  });
  usages.push(first.usage);

  const result = await repair(generator, ctx, applyCells(plan, targets, first.value), usages, 1);
  if (result.ok) return result;
  return {
    ok: false,
    reason: 'violations',
    plan: original,
    check: result.check,
    usages,
    regenerations: result.regenerations,
  };
}

/** 점검 → (지울 칸 지우기 → 다시 추천) 반복. regenerations는 이미 쓴 횟수에서 시작한다. */
async function repair(
  generator: PlanGenerator,
  ctx: PlanContext,
  start: Plan,
  usages: TokenUsage[],
  regenerations: number,
): Promise<{ ok: true; plan: Plan; check: CheckResult } & LoopStats | { ok: false; check: CheckResult } & LoopStats> {
  let plan = start;
  for (;;) {
    let check = checkPlan(plan, ctx.profile, ctx.classes, ctx.rules);
    if (check.violations.some((v) => v.rule === 'unexpected_cell')) {
      plan = removeUnexpectedCells(plan, check);
      check = checkPlan(plan, ctx.profile, ctx.classes, ctx.rules);
    }
    if (check.passed) return { ok: true, plan, check, usages, regenerations };

    const targets = uniqueSlots(check.violations.flatMap((v) => v.regenerate));
    if (regenerations >= MAX_REGENERATIONS || targets.length === 0) {
      return { ok: false, check, usages, regenerations };
    }

    const res: LlmResult<PlanCell[]> = await generator.regenerateCells({
      ...ctx,
      plan: structuredClone(plan),
      targets,
      violations: check.violations,
    });
    usages.push(res.usage);
    regenerations++;
    plan = applyCells(plan, targets, res.value);
  }
}

/**
 * unexpected_cell 위반 칸을 지운다 (regenerate가 빈 위반).
 * 같은 끼니에 칸이 여러 개면 checkPlan처럼 앞의 칸을 남기고 위반 개수만큼 뒤에서부터 지운다.
 */
export function removeUnexpectedCells(plan: Plan, check: CheckResult): Plan {
  const toRemove = new Map<number, number>();
  for (const v of check.violations) {
    if (v.rule !== 'unexpected_cell') continue;
    for (const slot of v.cells) {
      const order = slotOrder(slot);
      toRemove.set(order, (toRemove.get(order) ?? 0) + 1);
    }
  }
  const total = new Map<number, number>();
  for (const cell of plan.cells) total.set(slotOrder(cell), (total.get(slotOrder(cell)) ?? 0) + 1);

  const kept = new Map<number, number>();
  const cells = plan.cells.filter((cell) => {
    const order = slotOrder(cell);
    const keep = (total.get(order) ?? 0) - (toRemove.get(order) ?? 0);
    const count = kept.get(order) ?? 0;
    if (count >= keep) return false;
    kept.set(order, count + 1);
    return true;
  });
  return { ...structuredClone(plan), cells: structuredClone(cells) };
}

/**
 * targets 칸을 새 칸으로 바꾼다. targets가 아닌 칸은 버리고, 한 칸에 여러 개가 오면 첫 칸만 쓴다.
 * 돌아오지 않은 target 칸은 비워 두어 다음 점검에서 missing_cell로 잡히게 한다.
 */
export function applyCells(plan: Plan, targets: readonly Slot[], newCells: readonly PlanCell[]): Plan {
  const accepted: PlanCell[] = [];
  for (const cell of newCells) {
    if (!targets.some((t) => sameSlot(t, cell))) continue;
    if (accepted.some((c) => sameSlot(c, cell))) continue;
    accepted.push(structuredClone(cell));
  }
  const rest = plan.cells.filter((c) => !targets.some((t) => sameSlot(t, c)));
  const cells = [...structuredClone(rest), ...accepted].sort(compareSlots);
  return { ...structuredClone(plan), cells };
}

function uniqueSlots(slots: readonly Slot[]): Slot[] {
  const byOrder = new Map<number, Slot>();
  for (const slot of slots) if (!byOrder.has(slotOrder(slot))) byOrder.set(slotOrder(slot), toSlot(slot));
  return [...byOrder.values()].sort(compareSlots);
}
