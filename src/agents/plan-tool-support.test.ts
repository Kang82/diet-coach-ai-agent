// 식단 도구 실패 결과 (B5·B6 리뷰 1번): 던지지 않고 결과로 답한다
import { describe, expect, it } from 'vitest';
import { LLM_TIMEOUT_MESSAGE, LlmTimeoutError } from '../core/llm-timeout.ts';
import { PlanLoopError } from '../core/plan-loop.ts';
import { TOOL_ERROR_MESSAGE } from '../core/tool-failure.ts';
import { MODEL_CANDIDATES } from './models.ts';
import { planFailure } from './plan-tool-support.ts';

const log = { warn: () => {}, error: () => {} };

describe('planFailure', () => {
  it('시간 초과면 timeout, 실패 전까지 쓴 사용량을 센다', () => {
    const usage = { model: MODEL_CANDIDATES.gemma, input: 2_000, output: 8_000 };
    const error = new PlanLoopError(new LlmTimeoutError(1_000), { usages: [usage], regenerations: 1 });
    const out = planFailure(Date.now(), error, log);
    expect(out.status).toBe('timeout');
    expect(out.message).toBe(LLM_TIMEOUT_MESSAGE);
    expect(out.stats.usages).toEqual([usage]);
    expect(out.stats.regenerations).toBe(1);
    expect(out.stats.neurons).toBe(Math.round((2_000 * 9_091 + 8_000 * 27_273) / 1_000_000));
  });

  it('그 밖의 에러는 error, 사용량은 비어 있다', () => {
    const out = planFailure(Date.now(), new Error('boom'), log);
    expect(out).toMatchObject({ status: 'error', message: TOOL_ERROR_MESSAGE, stats: { usages: [], neurons: 0 } });
  });
});
