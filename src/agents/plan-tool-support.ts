// 식단표 도구(create_week_plan, edit_plan_cells)가 함께 쓰는 것.
import type { FlueLogger, JsonValue } from '@flue/runtime';
import { buildCriteria } from '../core/criteria.ts';
import { profileFromInterview, type InterviewResult } from '../core/interview.ts';
import { totalNeurons } from '../core/neurons.ts';
import { PlanLoopError } from '../core/plan-loop.ts';
import { failureKind, failureMessage } from '../core/tool-failure.ts';
import type { PlanGenerator, TokenUsage } from '../core/plan-generator.ts';
import type { PlanContext } from '../core/plan-loop.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import type { ClassifyToolOutput } from '../core/classify-tool-output.ts';
import type { EditToolOutput, PlanToolOutput, PlanToolStats } from '../core/plan-tool-output.ts';
import type { MenuClassification, Plan } from '../core/types.ts';
import { createDemoPlanGenerator } from './demo-plan-generator.ts';
import { createFluePlanGenerator, type PromptHarness } from './flue-plan-generator.ts';
import { meteredHarness, type NeuronMeter } from './metered-harness.ts';
import { NEURON_PRICES } from './models.ts';

/** 에이전트가 들고 있는 지금 식단표 (usePersistentState 'plan'). 칸 수정이 이것을 고친다. */
export type SavePlan = (plan: Plan) => void;

/** 식단표를 만들고 고칠 때 쓰는 프로필과 분류: 끝난 인터뷰 + 확인된 메뉴 분류 (tasks.md B5) */
export function planContext(result: InterviewResult, classes: readonly MenuClassification[]): PlanContext {
  const profile = profileFromInterview(result, new Date());
  return { profile, rules: buildCriteria(profile.goals), classes: structuredClone([...classes]) };
}

/**
 * 개발용 가짜 생성 모드: `.dev.vars`의 PLAN_GENERATOR=demo (demo-plan-generator.ts).
 * nodejs_compat에서는 Worker의 vars가 process.env로도 들어온다. 값이 없으면 실제 모델을 쓴다.
 */
export function pickGenerator(harness: PromptHarness): PlanGenerator {
  return process.env.PLAN_GENERATOR === 'demo' ? createDemoPlanGenerator() : createFluePlanGenerator(harness);
}

/** 도구 안 LLM 호출의 사용량을 전체 안전선 카운터에 더하는 harness (스펙 11.4-3). 기록 실패는 경고만 남긴다 */
export function metered(harness: PromptHarness, meter: NeuronMeter, log: Pick<FlueLogger, 'warn'>): PromptHarness {
  return meteredHarness(harness, meter, {
    onMeterError: (error) => log.warn('사용량 기록 실패', { message: error instanceof Error ? error.message : String(error) }),
  });
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

/**
 * 식단 도구가 실패했을 때의 결과 (리뷰 1번). 던지지 않고 이 결과로 턴을 끝낸다.
 * 실패 전까지 쓴 사용량(PlanLoopError.usages)은 통계에 넣는다. 시간 초과로 멈춘 호출의 사용량은 알 수 없다
 */
export function planFailure(
  startedAt: number,
  error: unknown,
  log: Pick<FlueLogger, 'warn' | 'error'>,
): { status: 'quota' | 'timeout' | 'error'; message: string; stats: PlanToolStats } {
  const kind = failureKind(error);
  const loop = error instanceof PlanLoopError ? error : { usages: [], regenerations: 0 };
  const stats = toolStats(startedAt, loop, log);
  log.error('식단 도구 실패', { kind, message: error instanceof Error ? error.message : String(error), ...stats });
  return { status: kind, message: failureMessage(kind), stats };
}

/** 도구 출력은 JSON 값이어야 한다. 인터페이스(Plan 등)를 JsonValue로 넘기려고 한 번 직렬화한다. 모양은 타입으로 검사한다. */
export function toJson(value: PlanToolOutput | EditToolOutput | InterviewToolOutput | ClassifyToolOutput): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
