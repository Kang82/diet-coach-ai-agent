// 스펙 4.3, 4.4. PlanGenerator 포트의 Flue 구현.
// harness.prompt(..., { result })로 칸을 받고, 사용량과 한도 초과 에러를 core의 모양으로 바꾼다.
import type { FlueHarness, PromptResultResponse } from '@flue/runtime';
import { dayType } from '../core/helpers.ts';
import type { PlanGenerator, TokenUsage } from '../core/plan-generator.ts';
import { buildGeneratePrompt, buildRegeneratePrompt, normalizeMenuId } from '../core/plan-prompt.ts';
import { LLM_TIME_LIMITS } from '../core/llm-timeout.ts';
import type { PlanCell, Profile } from '../core/types.ts';
import { PlanCellsResultSchema } from './plan-schema.ts';
import { promptWithLimit } from './prompt-call.ts';

/** harness 중 이 구현이 쓰는 부분. 테스트에서 가짜를 넣기 쉽게 좁혀 둔다. */
export type PromptHarness = Pick<FlueHarness, 'prompt'>;

export function createFluePlanGenerator(harness: PromptHarness): PlanGenerator {
  return {
    async generatePlan(input) {
      const res = await call(harness, buildGeneratePrompt(input), LLM_TIME_LIMITS.generatePlan);
      return { value: normalizeCells(res.data.cells, input.profile), usage: toTokenUsage(res) };
    },
    async regenerateCells(input) {
      const res = await call(harness, buildRegeneratePrompt(input), LLM_TIME_LIMITS.regenerateCells);
      return { value: normalizeCells(res.data.cells, input.profile), usage: toTokenUsage(res) };
    },
  } satisfies PlanGenerator;
}

type CellsResponse = PromptResultResponse<{ cells: PlanCell[] }>;

/** 한도 초과는 QuotaExceededError(루프가 즉시 멈춤), 시간 초과는 LlmTimeoutError로 바뀐다 (prompt-call.ts) */
async function call(harness: PromptHarness, text: string, limitMs: number): Promise<CellsResponse> {
  // valibot 출력 타입의 tags 등은 PlanCell과 같은 리터럴 유니온이다.
  return (await promptWithLimit(harness, text, { result: PlanCellsResultSchema }, limitMs)) as CellsResponse;
}

/** Flue는 모델을 { provider, id }로 나눠 준다. NEURON_PRICES 키(models.ts)와 같은 'provider/id' 모양으로 잇는다. */
export function toTokenUsage(res: Pick<CellsResponse, 'usage' | 'model'>): TokenUsage {
  return { model: `${res.model.provider}/${res.model.id}`, input: res.usage.input, output: res.usage.output };
}

/** 스펙 1.4 menuId 정규화. 외식 칸은 그 끼니의 메뉴 목록 글자에 맞춘다. */
function normalizeCells(cells: PlanCell[], profile: Profile): PlanCell[] {
  return cells.map((cell) => {
    const setting = profile.meals.find((m) => m.dayType === dayType(cell.day) && m.meal === cell.meal);
    const menus = cell.place === 'eat_out' ? (setting?.menus ?? []) : [];
    return { ...cell, menuId: normalizeMenuId(cell.menuId, menus) };
  });
}
