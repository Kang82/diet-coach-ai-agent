// tasks.md T8-4: 호출 제한은 호출별 상한과 남은 예산 중 짧은 쪽
import { describe, expect, it } from 'vitest';
import { callLimit, LLM_TIME_LIMITS, MIN_REGENERATE_MS, PLAN_TOOL_BUDGETS } from './llm-timeout.ts';

describe('callLimit', () => {
  it('남은 시간이 없으면(예산 없음) 호출별 상한', () => {
    expect(callLimit(LLM_TIME_LIMITS.generatePlan, undefined)).toBe(8 * 60_000);
  });

  it('남은 시간이 더 짧으면 남은 시간, 길면 호출별 상한', () => {
    expect(callLimit(LLM_TIME_LIMITS.regenerateCells, 3 * 60_000)).toBe(3 * 60_000);
    expect(callLimit(LLM_TIME_LIMITS.generatePlan, PLAN_TOOL_BUDGETS.createPlan)).toBe(8 * 60_000);
  });

  it('음수가 되지 않는다', () => {
    expect(callLimit(LLM_TIME_LIMITS.regenerateCells, -5)).toBe(0);
  });

  it('칸 수정 예산은 다시 추천 최소 시간보다 길다', () => {
    expect(PLAN_TOOL_BUDGETS.editPlanCells).toBeGreaterThan(MIN_REGENERATE_MS);
  });
});
