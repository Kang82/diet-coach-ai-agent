// 스펙 4.3, 4.4. PlanGenerator 포트의 Flue 구현.
// harness.prompt(..., { result })로 칸을 받고, 사용량과 한도 초과 에러를 core의 모양으로 바꾼다.
import type { FlueHarness, PromptResultResponse, ThinkingLevel } from '@flue/runtime';
import type { PlanGenerator, TokenUsage } from '../core/plan-generator.ts';
import { finishCells } from '../core/plan-cells.ts';
import { buildGeneratePrompt, buildRegeneratePrompt } from '../core/plan-prompt.ts';
import { callLimit, LLM_TIME_LIMITS, type StreamStats } from '../core/llm-timeout.ts';
import { PlanCellsResultSchema, toPlanCells, type RawPlanCell } from './plan-schema.ts';
import { promptWatched } from './prompt-call.ts';

/** harness 중 이 구현이 쓰는 부분. 테스트에서 가짜를 넣기 쉽게 좁혀 둔다. */
export type PromptHarness = Pick<FlueHarness, 'prompt'>;

export interface FluePlanGeneratorOptions {
  /** 식단 생성·다시 추천의 추론 수준. 없으면 Flue 기본값('medium')이다 (models.ts planThinking, tasks.md T8-4) */
  thinkingLevel?: ThinkingLevel;
  /** 식단 생성·다시 추천 모델. 없으면 에이전트 기본 모델(gemma)이다 (models.ts planModel, tasks.md B14) */
  model?: string;
}

export function createFluePlanGenerator(harness: PromptHarness, options: FluePlanGeneratorOptions = {}): PlanGenerator {
  const extra = {
    ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    ...(options.model ? { model: options.model } : {}),
  };
  return {
    async generatePlan(input, callOptions) {
      const callMaxMs = LLM_TIME_LIMITS.generatePlan;
      const { res, stream } = await call(harness, buildGeneratePrompt(input), extra, callLimit(callMaxMs, callOptions?.limitMs), callMaxMs);
      return { value: finishCells(toPlanCells(res.data), input.profile, input.classes), usage: withStream(toTokenUsage(res), stream) };
    },
    async regenerateCells(input, callOptions) {
      const callMaxMs = LLM_TIME_LIMITS.regenerateCells;
      const { res, stream } = await call(harness, buildRegeneratePrompt(input), extra, callLimit(callMaxMs, callOptions?.limitMs), callMaxMs);
      return { value: finishCells(toPlanCells(res.data), input.profile, input.classes), usage: withStream(toTokenUsage(res), stream) };
    },
  } satisfies PlanGenerator;
}

// 스키마가 받아 준 모양(값 하나 문자열, null 배열)은 toPlanCells가 PlanCell로 맞춘다
type CellsResponse = PromptResultResponse<{ cells: RawPlanCell[] }>;

/**
 * 한도 초과는 QuotaExceededError(루프가 즉시 멈춤), 시간 초과는 원인을 실은 LlmTimeoutError로 바뀐다 (prompt-call.ts).
 * callMaxMs: 호출별 원래 상한. limitMs가 더 짧으면 도구 시간 예산이 줄인 호출이다 (B19)
 */
async function call(
  harness: PromptHarness,
  text: string,
  extra: { thinkingLevel?: ThinkingLevel; model?: string },
  limitMs: number,
  callMaxMs: number,
): Promise<{ res: CellsResponse; stream: StreamStats }> {
  const out = await promptWatched(harness, text, { result: PlanCellsResultSchema, ...extra }, limitMs, { callMaxMs });
  return { res: out.response as CellsResponse, stream: out.stream };
}

/** 바인딩 요청을 하나라도 봤을 때만 싣는다(단위 테스트의 가짜 harness나 관찰이 끊긴 경우는 뺀다) */
function withStream(usage: TokenUsage, stream: StreamStats): TokenUsage {
  return stream.requests > 0 ? { ...usage, stream } : usage;
}

/** Flue는 모델을 { provider, id }로 나눠 준다. NEURON_PRICES 키(models.ts)와 같은 'provider/id' 모양으로 잇는다. */
export function toTokenUsage(res: Pick<CellsResponse, 'usage' | 'model'>): TokenUsage {
  return { model: `${res.model.provider}/${res.model.id}`, input: res.usage.input, output: res.usage.output };
}
