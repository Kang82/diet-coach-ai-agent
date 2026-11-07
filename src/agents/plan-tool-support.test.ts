// 식단 도구 실패 결과 (B5·B6 리뷰 1번): 던지지 않고 결과로 답한다
import { describe, expect, it } from 'vitest';
import { LLM_TIMEOUT_MESSAGE, LlmTimeoutError } from '../core/llm-timeout.ts';
import { PlanLoopError } from '../core/plan-loop.ts';
import { TOOL_ERROR_MESSAGE } from '../core/tool-failure.ts';
import { MODEL_CANDIDATES } from './models.ts';
import { planFailure, runGuarded } from './plan-tool-support.ts';

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

// B13(T10-2, T10-4): 게이트에 진 호출은 일을 하지 않고, 이긴 호출은 끝나면 예약을 지운다
describe('runGuarded', () => {
  function setup(claimed: boolean, release: () => Promise<void> = async () => {}) {
    const calls: string[] = [];
    const warnings: string[] = [];
    const run = (work: () => Promise<string>) =>
      runGuarded(
        {
          claim: async () => (calls.push('claim'), claimed),
          release: async (fn) => (calls.push('release'), fn()),
          releaseReservation: async () => (calls.push('release-db'), release()),
          log: { warn: (msg: string) => void warnings.push(msg), info: () => {} },
          duplicate: () => 'duplicate',
        },
        work,
      );
    return { calls, warnings, run };
  }

  it('게이트에 지면 일도 정산도 하지 않고 duplicate', async () => {
    const { calls, run } = setup(false);
    expect(await run(async () => 'work')).toBe('duplicate');
    expect(calls).toEqual(['claim']);
  });

  it('이기면 일을 하고 끝난 뒤 예약을 지운다', async () => {
    const { calls, run } = setup(true);
    expect(await run(async () => (calls.push('work'), 'ok'))).toBe('ok');
    expect(calls).toEqual(['claim', 'work', 'release', 'release-db']);
  });

  it('예약 지우기가 실패해도 결과는 그대로이고 경고만 남긴다 (만료로 풀린다)', async () => {
    const { warnings, run } = setup(true, async () => {
      throw new Error('d1 down');
    });
    expect(await run(async () => 'ok')).toBe('ok');
    expect(warnings).toEqual(['예약 정산 실패']);
  });
});
