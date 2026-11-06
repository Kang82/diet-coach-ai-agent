// 식단표 도구(create_week_plan, edit_plan_cells)가 함께 쓰는 것.
import type { FlueLogger, JsonValue } from '@flue/runtime';
import { classesA, profileA } from '../core/__fixtures__/persona-a.ts';
import { buildCriteria } from '../core/criteria.ts';
import { totalNeurons } from '../core/neurons.ts';
import type { PlanGenerator, TokenUsage } from '../core/plan-generator.ts';
import type { PlanContext } from '../core/plan-loop.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import type { EditToolOutput, PlanToolOutput, PlanToolStats } from '../core/plan-tool-output.ts';
import type { Plan } from '../core/types.ts';
import { createDemoPlanGenerator } from './demo-plan-generator.ts';
import { createFluePlanGenerator, type PromptHarness } from './flue-plan-generator.ts';
import { NEURON_PRICES } from './models.ts';

/** 에이전트가 들고 있는 지금 식단표 (usePersistentState 'plan'). 칸 수정이 이것을 고친다. */
export type SavePlan = (plan: Plan) => void;

/** 프로필은 인터뷰(T4)가 생기기 전까지 페르소나 A로 고정한다 (tasks.md T2). */
export function planContext(): PlanContext {
  const profile = structuredClone(profileA);
  return { profile, rules: buildCriteria(profile.goals), classes: structuredClone(classesA) };
}

/**
 * 개발용 가짜 생성 모드: `.dev.vars`의 PLAN_GENERATOR=demo (demo-plan-generator.ts).
 * nodejs_compat에서는 Worker의 vars가 process.env로도 들어온다. 값이 없으면 실제 모델을 쓴다.
 */
export function pickGenerator(harness: PromptHarness): PlanGenerator {
  return process.env.PLAN_GENERATOR === 'demo' ? createDemoPlanGenerator() : createFluePlanGenerator(harness);
}

/** 운영 경로의 Neuron 계산. 단가를 모르는 모델은 가장 비싼 단가로 세고 경고한다 (스펙 11.4). */
export function countNeurons(usages: TokenUsage[], log: Pick<FlueLogger, 'warn'>): number {
  return Math.round(
    totalNeurons(usages, NEURON_PRICES, {
      unknownModel: 'max-price',
      onUnknownModel: (model) => log.warn('단가를 모르는 모델이라 가장 비싼 단가로 셈', { model }),
    }),
  );
}

export function toolStats(
  startedAt: number,
  loop: { usages: TokenUsage[]; regenerations: number },
  log: Pick<FlueLogger, 'warn'>,
): PlanToolStats {
  return {
    seconds: Math.round((Date.now() - startedAt) / 1000),
    regenerations: loop.regenerations,
    usages: loop.usages,
    neurons: countNeurons(loop.usages, log),
  };
}

/** 도구 출력은 JSON 값이어야 한다. 인터페이스(Plan 등)를 JsonValue로 넘기려고 한 번 직렬화한다. 모양은 타입으로 검사한다. */
export function toJson(value: PlanToolOutput | EditToolOutput | InterviewToolOutput): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
