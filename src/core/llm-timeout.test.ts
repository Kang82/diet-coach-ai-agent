// tasks.md T8-4: 호출 제한은 호출별 상한과 남은 예산 중 짧은 쪽
import { describe, expect, it } from 'vitest';
import {
  callLimit,
  LLM_TIME_LIMITS,
  LLM_TIMEOUT_MESSAGE,
  MIN_REGENERATE_MS,
  PLAN_TOOL_BUDGETS,
  STALL_MS,
  TIMEOUT_MESSAGES,
  timeoutReason,
} from './llm-timeout.ts';

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

// B19(T8-8): 시간 초과 원인. 11-08 배포본 실패는 모델이 300초 동안 한 바이트도 보내지 않은 경우였다
describe('timeoutReason', () => {
  it('바이트 없이 지난 간격이 STALL_MS 이상이면 무응답(stalled). 예산 컷보다 먼저 본다', () => {
    expect(timeoutReason({ requests: 1, maxGapMs: STALL_MS, byBudget: false })).toBe('stalled');
    expect(timeoutReason({ requests: 2, maxGapMs: 300_000, byBudget: true })).toBe('stalled');
  });

  it('응답은 왔고 호출 상한이 남은 예산으로 줄었으면 budget, 아니면 call_limit', () => {
    expect(timeoutReason({ requests: 1, maxGapMs: 5_000, byBudget: true })).toBe('budget');
    expect(timeoutReason({ requests: 1, maxGapMs: 5_000, byBudget: false })).toBe('call_limit');
  });

  it('관찰한 요청이 없으면(스트림을 못 봤음) 무응답이라고 하지 않는다', () => {
    expect(timeoutReason({ requests: 0, maxGapMs: 600_000, byBudget: false })).toBe('call_limit');
    expect(timeoutReason({ requests: 0, maxGapMs: 600_000, byBudget: true })).toBe('budget');
  });

  it('원인마다 문구가 다르고, call_limit은 예전 문구 그대로', () => {
    expect(TIMEOUT_MESSAGES.call_limit).toBe(LLM_TIMEOUT_MESSAGE);
    expect(TIMEOUT_MESSAGES.stalled).toContain('응답하지 않아');
    expect(TIMEOUT_MESSAGES.budget).toContain('정해 둔 시간');
    expect(new Set(Object.values(TIMEOUT_MESSAGES)).size).toBe(3);
  });
});
