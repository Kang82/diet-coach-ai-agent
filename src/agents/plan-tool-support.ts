// 식단표 도구(create_week_plan, edit_plan_cells)가 함께 쓰는 것.
import type { FlueLogger, JsonValue } from '@flue/runtime';
import { buildCriteria } from '../core/criteria.ts';
import { profileFromInterview, type InterviewResult } from '../core/interview.ts';
import { totalNeurons } from '../core/neurons.ts';
import { PlanLoopError } from '../core/plan-loop.ts';
import { failureKind, failureMessage, timeoutDetail } from '../core/tool-failure.ts';
import type { PlanGenerator, TokenUsage } from '../core/plan-generator.ts';
import type { PlanContext } from '../core/plan-loop.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import type { ClassifyToolOutput } from '../core/classify-tool-output.ts';
import type { EditToolOutput, PlanToolOutput, PlanToolStats } from '../core/plan-tool-output.ts';
import type { GuardStore } from '../storage/guard-store.ts';
import type { MenuClassification, Plan } from '../core/types.ts';
import { createDemoPlanGenerator } from './demo-plan-generator.ts';
import { createFluePlanGenerator, type PromptHarness } from './flue-plan-generator.ts';
import { meteredHarness, type NeuronMeter } from './metered-harness.ts';
import { NEURON_PRICES, planModel, planThinking } from './models.ts';
import type { Storage } from '../storage/storage.ts';

/** 에이전트가 들고 있는 지금 식단표 (usePersistentState 'plan'). 칸 수정이 이것을 고친다. */
export type SavePlan = (plan: Plan) => void;

/** 식단표를 만들고 고칠 때 쓰는 프로필과 분류: 끝난 인터뷰 + 확인된 메뉴 분류 (tasks.md B5) */
export function planContext(result: InterviewResult, classes: readonly MenuClassification[]): PlanContext {
  const profile = profileFromInterview(result, new Date());
  return { profile, rules: buildCriteria(profile.goals), classes: structuredClone([...classes]) };
}

/**
 * 'start' step 전 준비(planContext, 사전 점검)를 던지지 않게 감싼다 (T19-5). 던지면 바깥 모델이 도구를 다시 부를 수 있다(CLAUDE.md).
 * 실패는 planFailure 결과(error)로 바꿔 도구가 그대로 답한다. 준비는 LLM을 부르지 않아 걸린 시간·사용량은 0으로 센다
 */
export function prepareSafely<T>(
  prepare: () => T,
  log: Pick<FlueLogger, 'warn' | 'error'>,
): { ok: true; value: T } | { ok: false; failure: ReturnType<typeof planFailure> } {
  try {
    return { ok: true, value: prepare() };
  } catch (error) {
    return { ok: false, failure: planFailure(Date.now(), error, log) };
  }
}

/**
 * 개발용 가짜 생성 모드: `.dev.vars`의 PLAN_GENERATOR=demo (demo-plan-generator.ts).
 * nodejs_compat에서는 Worker의 vars가 process.env로도 들어온다. 값이 없으면 실제 모델을 쓴다.
 * 추론 수준은 PLAN_THINKING(models.ts planThinking), 모델은 PLAN_MODEL(planModel, B14). 없으면 gpt-oss-120b, low (T8-7)
 */
export function pickGenerator(harness: PromptHarness): PlanGenerator {
  if (process.env.PLAN_GENERATOR === 'demo') return createDemoPlanGenerator();
  const thinkingLevel = planThinking(process.env.PLAN_THINKING);
  const model = planModel(process.env.PLAN_MODEL);
  return createFluePlanGenerator(harness, { thinkingLevel, model });
}

/** 서버 저장(T6-2)에 쓰는 저장소와 사용자. 사용자를 모르는 대화(flue run 등)면 없다 */
export interface UserStore {
  storage: Storage;
  userId: string;
  /** 지난 식단표 목록 표시용 (T17). 대화 ID와 conversations 테이블 */
  conversationId: string;
  guard: Pick<GuardStore, 'markConversationPlan'>;
}

/**
 * 만들기·칸 수정이 성공하면 지난 식단표 목록에 이 대화를 표시한다 (T17). 저장 동의와 관계없다(날짜만).
 * durable 도구라 mark step에 둔다(시각도 step 안에서 정해 복구 때 같은 값). 실패해도 결과는 대화에 남아 경고만
 */
export async function markPlanQuietly(
  log: Pick<FlueLogger, 'warn' | 'info'>,
  step: { do: <T>(name: string, fn: () => Promise<T>) => Promise<T> },
  store: Pick<UserStore, 'conversationId' | 'guard'>,
  plan: Pick<Plan, 'weekStart'>,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  await persistQuietly(log, '지난 식단표 목록 표시', () =>
    step.do('mark', () => store.guard.markConversationPlan(store.conversationId, plan.weekStart, now())),
  );
}

/** 서버 저장은 실패해도 도구 결과를 깨지 않는다. 결과는 대화에 남아 있다 (storage/persist.ts) */
export async function persistQuietly(log: Pick<FlueLogger, 'warn' | 'info'>, label: string, work: () => Promise<unknown>) {
  try {
    const saved = await work();
    log.info(`${label} 저장`, { saved: saved !== false });
  } catch (error) {
    log.warn(`${label} 저장 실패`, { message: error instanceof Error ? error.message : String(error) });
  }
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
  loop: { usages: TokenUsage[]; regenerations: number; stoppedForTime?: true },
  log: Pick<FlueLogger, 'warn'>,
): PlanToolStats {
  return {
    seconds: Math.round((Date.now() - startedAt) / 1000),
    regenerations: loop.regenerations,
    usages: loop.usages,
    neurons: countNeurons(loop.usages, log),
    ...(loop.stoppedForTime ? { stoppedForTime: true as const } : {}),
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
  // 시간 초과면 원인(stalled·budget·call_limit)과 스트림 관찰 결과도 남긴다 (B19). 내용 없이 시각·횟수만
  const { reason, stream } = timeoutDetail(error);
  log.error('식단 도구 실패', {
    kind,
    message: error instanceof Error ? error.message : String(error),
    ...(reason ? { reason } : {}),
    ...(stream ? { stream } : {}),
    ...stats,
  });
  return { status: kind, message: failureMessage(kind, error), stats };
}

/** 도구 출력은 JSON 값이어야 한다. 인터페이스(Plan 등)를 JsonValue로 넘기려고 한 번 직렬화한다. 모양은 타입으로 검사한다. */
export function toJson(value: PlanToolOutput | EditToolOutput | InterviewToolOutput | ClassifyToolOutput): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/**
 * 비싼 도구(분류, 만들기, 칸 수정)의 앞뒤 (tasks.md T10-2, T10-4).
 * - claim: 이 응답에서 처음 불린 호출인지(ToolGate). 지면 일도 예약 정산도 하지 않고 duplicate로 끝낸다. 이긴 호출이 아직 돌고 있다
 * - 이기면 일을 하고, 끝나면(성공·실패·조기 반환 모두) 미들웨어가 둔 진행 중 예약을 지운다. 실패해도 만료로 풀리니 경고만
 * durable 도구는 claim과 release를 step으로 감싸 넘긴다(복구 때 같은 호출이 이기고, 정산 기록이 남는다)
 */
export async function runGuarded<T>(
  options: {
    claim: () => Promise<boolean>;
    /** 정산을 감싸는 방법. durable이면 step.do('release', fn), 아니면 fn() */
    release: (fn: () => Promise<boolean>) => Promise<boolean>;
    releaseReservation: () => Promise<void>;
    log: Pick<FlueLogger, 'warn' | 'info'>;
    duplicate: () => T;
  },
  work: () => Promise<T>,
): Promise<T> {
  if (!(await options.claim())) {
    options.log.info('같은 응답의 중복 호출이라 건너뜀');
    return options.duplicate();
  }
  try {
    return await work();
  } finally {
    await options.release(async () => {
      try {
        await options.releaseReservation();
        return true;
      } catch (error) {
        options.log.warn('예약 정산 실패', { message: error instanceof Error ? error.message : String(error) });
        return false;
      }
    });
  }
}
