// 스펙 4.4 점검과 다시 추천 루프.
// LLM은 PlanGenerator 포트로만 부른다. 입력 식단표는 고치지 않고 새 객체를 만든다.
import { checkPlan, requiredSlots } from './check-plan.ts';
import { compareSlots, menuKey, sameSlot, slotOrder, toSlot } from './helpers.ts';
import { MIN_REGENERATE_MS } from './llm-timeout.ts';
import type { CallOptions, PlanGenerator, TokenUsage } from './plan-generator.ts';
import { QuotaExceededError } from './quota.ts';
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

export interface LoopStats {
  /** 이번 루프에서 성공한 LLM 호출의 사용량, 호출 순서대로 */
  usages: TokenUsage[];
  /** regenerateCells를 부른 횟수. 실패한 호출은 세지 않는다. */
  regenerations: number;
  /** 시간 예산이 모자라 다시 추천을 멈췄으면 true (tasks.md T8-4). 그렇지 않으면 키가 없다 */
  stoppedForTime?: true;
}

/**
 * 도구 전체 시간 예산 (tasks.md T8-4). 루프는 순수 로직이라 시계를 받는다.
 * 각 호출에는 남은 시간을 limitMs로 넘기고, 남은 시간이 MIN_REGENERATE_MS보다 적으면 다시 추천을 새로 부르지 않는다.
 * 없으면 시간 제한 없이 돈다(호출별 제한은 구현이 건다).
 */
export interface TimeBudget {
  totalMs: number;
  now: () => number;
}

export interface CreatePlanInput {
  /** 호출자가 정한다. 루프는 순수 로직이라 ID와 시각을 만들지 않는다. */
  planId: string;
  createdAt: string;
  weekStart: string;
  events: PlanEvent[];
  budget?: TimeBudget;
}

export type CreatePlanResult =
  | ({ ok: true; plan: Plan; check: CheckResult } & LoopStats)
  /**
   * 식단표를 사용자에게 보여 주지 않는다. check는 마지막 시도의 점검 결과로 위반 원인을 알리는 데 쓰고,
   * lastPlan은 평가 세트와 디버깅 기록용이다.
   */
  | ({ ok: false; reason: 'violations'; check: CheckResult; lastPlan: Plan } & LoopStats)
  /** 하루 한도 초과 (스펙 11.3). 만들던 식단표는 버린다. */
  | ({ ok: false; reason: 'quota' } & LoopStats);

export type EditPlanResult =
  | ({
      ok: true;
      plan: Plan;
      check: CheckResult;
      /** 수정 전과 달라진 칸, 시간순. 사용자가 고르지 않은 칸이 들어 있으면 화면에서 알린다. */
      changed: Slot[];
      /** 사용자가 고른 칸 중 메뉴가 그대로인 칸 (LLM이 요청을 반영하지 않았을 수 있음) */
      unchangedTargets: Slot[];
    } & LoopStats)
  /** plan은 수정 전 식단표 그대로다. check는 마지막 시도의 점검 결과. */
  | ({ ok: false; reason: 'violations'; plan: Plan; check: CheckResult } & LoopStats)
  /** 하루 한도 초과. plan은 수정 전 식단표 그대로다. */
  | ({ ok: false; reason: 'quota'; plan: Plan } & LoopStats)
  /**
   * 수정 전 식단표가 지금 조건(프로필, 메뉴 분류, 기준)으로 이미 위반이다. LLM을 부르지 않는다.
   * 조건이 바뀐 뒤의 식단표는 칸 수정 대신 새로 만들게 한다 (tasks.md 열린 질문, 2026-11-06 결정).
   */
  | ({ ok: false; reason: 'stale_plan'; plan: Plan; check: CheckResult } & LoopStats)
  /** 고를 수 없는 칸(채우지 않는 끼니, 일정이 있는 끼니) 또는 빈 요청. LLM을 부르지 않는다. */
  | ({ ok: false; reason: 'invalid_targets'; plan: Plan; invalidTargets: Slot[] } & LoopStats);

/**
 * 한도 초과가 아닌 LLM 에러. 원래 에러는 cause에 두고, 그때까지 쓴 사용량을 붙여 던진다.
 * 호출자는 실패했더라도 usages를 Neuron 안전선(스펙 11.4-3)에 더해야 한다.
 */
export class PlanLoopError extends Error {
  readonly usages: TokenUsage[];
  readonly regenerations: number;

  constructor(cause: unknown, stats: LoopStats) {
    super(`식단표 생성 중 LLM 호출 실패: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'PlanLoopError';
    this.usages = [...stats.usages];
    this.regenerations = stats.regenerations;
  }
}

/** 1주일 식단표를 만들고 점검·다시 추천한다 (스펙 4.4-1~3). */
export async function createPlan(
  generator: PlanGenerator,
  ctx: PlanContext,
  input: CreatePlanInput,
): Promise<CreatePlanResult> {
  const stats: LoopStats = { usages: [], regenerations: 0 };
  const clock = deadline(input.budget);
  try {
    const generated = await generator.generatePlan({ ...ctx, weekStart: input.weekStart, events: input.events }, clock.options());
    stats.usages.push(generated.usage);

    // LLM에는 칸만 받는다. 일정과 날짜는 입력 값을 쓴다.
    const plan: Plan = {
      planId: input.planId,
      userId: ctx.profile.userId,
      profileVersion: ctx.profile.version,
      weekStart: input.weekStart,
      events: structuredClone(input.events),
      cells: structuredClone(generated.value).sort(compareSlots),
      createdAt: input.createdAt,
    };

    const result = await repair(generator, ctx, plan, stats, clock);
    if (result.ok) return { ok: true, plan: result.plan, check: result.check, ...stats };
    return { ok: false, reason: 'violations', check: result.check, lastPlan: result.plan, ...stats };
  } catch (error) {
    if (error instanceof QuotaExceededError) return { ok: false, reason: 'quota', ...stats };
    throw new PlanLoopError(error, stats);
  }
}

/**
 * 사용자가 고른 칸을 다시 추천한다 (스펙 4.4-4).
 * 요청한 칸을 바꾼 뒤 생긴 위반은 같은 루프로 고치고, 3회 안에 통과하지 못하면 수정 전 식단표를 돌려준다.
 */
export async function editPlanCells(
  generator: PlanGenerator,
  ctx: PlanContext,
  plan: Plan,
  input: { targets: Slot[]; userRequest: string; budget?: TimeBudget },
): Promise<EditPlanResult> {
  const original = structuredClone(plan);
  const targets = uniqueSlots(input.targets);
  const stats: LoopStats = { usages: [], regenerations: 0 };

  const allowed = requiredSlots(ctx.profile, plan.events);
  const invalidTargets = targets.filter((t) => !allowed.some((a) => sameSlot(a, t)));
  if (targets.length === 0 || invalidTargets.length > 0) {
    return { ok: false, reason: 'invalid_targets', plan: original, invalidTargets, ...stats };
  }

  const before = checkPlan(plan, ctx.profile, ctx.classes, ctx.rules);
  if (!before.passed) return { ok: false, reason: 'stale_plan', plan: original, check: before, ...stats };

  const request = { slots: targets, text: input.userRequest };
  const clock = deadline(input.budget);
  try {
    const first = await generator.regenerateCells({
      ...ctx,
      plan: structuredClone(plan),
      targets,
      violations: [],
      userRequest: input.userRequest,
    }, clock.options()); // 사용자가 요청한 호출이라 남은 시간과 관계없이 부른다
    stats.usages.push(first.usage);
    stats.regenerations++;

    const result = await repair(generator, ctx, applyCells(plan, targets, first.value), stats, clock, request);
    if (!result.ok) return { ok: false, reason: 'violations', plan: original, check: result.check, ...stats };
    return {
      ok: true,
      plan: result.plan,
      check: result.check,
      changed: changedSlots(original, result.plan),
      unchangedTargets: targets.filter((t) => sameMenu(original, result.plan, t)),
      ...stats,
    };
  } catch (error) {
    if (error instanceof QuotaExceededError) return { ok: false, reason: 'quota', plan: original, ...stats };
    throw new PlanLoopError(error, stats);
  }
}

/**
 * 점검 → (지울 칸 지우기 → 다시 추천) 반복. stats를 고쳐 가며 사용량과 횟수를 센다.
 * request가 있으면(칸 수정) 사용자가 고른 칸이 다시 대상이 될 때 사용자 요청도 함께 보낸다.
 * LLM 에러는 잡지 않고 그대로 던진다 (바깥에서 결과나 PlanLoopError로 바꾼다).
 */
async function repair(
  generator: PlanGenerator,
  ctx: PlanContext,
  start: Plan,
  stats: LoopStats,
  clock: Deadline,
  request?: { slots: Slot[]; text: string },
): Promise<{ ok: boolean; plan: Plan; check: CheckResult }> {
  let plan = start;
  for (;;) {
    let check = checkPlan(plan, ctx.profile, ctx.classes, ctx.rules);
    if (check.violations.some((v) => v.rule === 'unexpected_cell')) {
      plan = removeUnexpectedCells(plan, check);
      check = checkPlan(plan, ctx.profile, ctx.classes, ctx.rules);
    }
    if (check.passed) return { ok: true, plan, check };

    // 지금 규칙에서는 unexpected_cell(위에서 지움)만 regenerate가 비어 있어서 targets가 빌 수 없다.
    // 규칙이 늘어 regenerate가 빈 위반이 남으면 LLM으로 고칠 수 없으므로 회차가 남아도 실패로 끝낸다.
    const targets = uniqueSlots(check.violations.flatMap((v) => v.regenerate));
    if (stats.regenerations >= MAX_REGENERATIONS || targets.length === 0) return { ok: false, plan, check };
    if (clock.remaining() < MIN_REGENERATE_MS) {
      stats.stoppedForTime = true;
      return { ok: false, plan, check };
    }

    const res = await generator.regenerateCells({
      ...ctx,
      plan: structuredClone(plan),
      targets,
      violations: check.violations,
      ...(request && targets.some((t) => request.slots.some((r) => sameSlot(r, t))) ? { userRequest: request.text } : {}),
    }, clock.options());
    stats.usages.push(res.usage);
    stats.regenerations++;
    plan = applyCells(plan, targets, res.value);
  }
}

interface Deadline {
  /** 남은 시간(ms). 예산이 없으면 Infinity */
  remaining(): number;
  /** 다음 호출 옵션. 예산이 없으면 undefined(옵션 없이 부른다) */
  options(): CallOptions | undefined;
}

function deadline(budget: TimeBudget | undefined): Deadline {
  if (!budget) return { remaining: () => Infinity, options: () => undefined };
  const end = budget.now() + budget.totalMs;
  const remaining = () => Math.max(0, end - budget.now());
  return { remaining, options: () => ({ limitMs: remaining() }) };
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

/** 두 식단표에서 내용이 다른 칸 (생기거나 없어진 칸 포함), 시간순 */
function changedSlots(before: Plan, after: Plan): Slot[] {
  const slots = uniqueSlots([...before.cells, ...after.cells]);
  return slots.filter((slot) => {
    const a = before.cells.find((c) => sameSlot(c, slot));
    const b = after.cells.find((c) => sameSlot(c, slot));
    return !a || !b || canonical(a) !== canonical(b);
  });
}

function sameMenu(before: Plan, after: Plan, slot: Slot): boolean {
  const a = before.cells.find((c) => sameSlot(c, slot));
  const b = after.cells.find((c) => sameSlot(c, slot));
  return !!a && !!b && menuKey(a.menuId) === menuKey(b.menuId);
}

/** 키 순서와 관계없이 비교하려고 키를 정렬해 직렬화한다. */
function canonical(cell: PlanCell): string {
  return JSON.stringify(cell, Object.keys(cell).sort());
}

function uniqueSlots(slots: readonly Slot[]): Slot[] {
  const byOrder = new Map<number, Slot>();
  for (const slot of slots) if (!byOrder.has(slotOrder(slot))) byOrder.set(slotOrder(slot), toSlot(slot));
  return [...byOrder.values()].sort(compareSlots);
}
