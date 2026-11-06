// 도구 실패 분류 (B5·B6 리뷰 1번)
import { describe, expect, it } from 'vitest';
import { LLM_TIMEOUT_MESSAGE, LlmTimeoutError } from './llm-timeout.ts';
import { PlanLoopError } from './plan-loop.ts';
import { QUOTA_EXCEEDED_MESSAGE, QuotaExceededError } from './quota.ts';
import { failureKind, failureMessage, TOOL_ERROR_MESSAGE } from './tool-failure.ts';

describe('failureKind', () => {
  it('시간 초과, 한도 초과, 그 밖의 에러', () => {
    expect(failureKind(new LlmTimeoutError(1_000))).toBe('timeout');
    expect(failureKind(new QuotaExceededError())).toBe('quota');
    expect(failureKind(new Error('boom'))).toBe('error');
    expect(failureKind('문자열')).toBe('error');
  });

  it('감싼 에러는 cause를 따라간다', () => {
    const wrapped = new PlanLoopError(new LlmTimeoutError(1_000), { usages: [], regenerations: 0 });
    expect(failureKind(wrapped)).toBe('timeout');
    expect(failureKind(new Error('x', { cause: new QuotaExceededError() }))).toBe('quota');
  });
});

describe('failureMessage', () => {
  it('종류별 안내', () => {
    expect(failureMessage('timeout')).toBe(LLM_TIMEOUT_MESSAGE);
    expect(failureMessage('quota')).toBe(QUOTA_EXCEEDED_MESSAGE);
    expect(failureMessage('error')).toBe(TOOL_ERROR_MESSAGE);
  });
});
