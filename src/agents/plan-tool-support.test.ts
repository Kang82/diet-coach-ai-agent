// 식단 도구 실패 결과 (B5·B6 리뷰 1번): 던지지 않고 결과로 답한다
import { describe, expect, it } from 'vitest';
import { LLM_TIMEOUT_MESSAGE, LlmTimeoutError } from '../core/llm-timeout.ts';
import { PlanLoopError } from '../core/plan-loop.ts';
import { TOOL_ERROR_MESSAGE } from '../core/tool-failure.ts';
import { MODEL_CANDIDATES } from './models.ts';
import { loadLastWeekQuietly, markPlanQuietly, planFailure, prepareSafely, recordProfileEditsQuietly, runGuarded } from './plan-tool-support.ts';
import { classesA, planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { MemoryStorage } from '../storage/memory-storage.ts';
import type { Slot } from '../core/types.ts';

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

// T19-5 (2차 코드 리뷰): 'start' step 전 준비(planContext, 사전 점검)도 던지지 않고 결과로 답한다
describe('prepareSafely', () => {
  it('준비가 끝나면 값을 돌려준다', () => {
    expect(prepareSafely(() => 42, log)).toEqual({ ok: true, value: 42 });
  });

  it('준비가 던지면(목표가 빈 인터뷰 결과 등) 실패 결과(error)로 바꾼다', () => {
    const out = prepareSafely(() => {
      throw new Error('목표가 하나 이상 있어야 합니다.');
    }, log);
    expect(out).toMatchObject({ ok: false, failure: { status: 'error', message: TOOL_ERROR_MESSAGE, stats: { usages: [], neurons: 0 } } });
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

// T26: 인터뷰가 끝나면 프로필 고친 항목 수를 남긴다
describe('recordProfileEditsQuietly', () => {
  const log = { warn: () => {}, info: () => {} };

  it('값이 있으면 대화에 남기고, 없으면(이전 화면) 부르지 않는다', async () => {
    const calls: unknown[][] = [];
    const store = {
      conversationId: 'u1-a',
      guard: { markConversationPlan: async () => {}, setProfileEdits: async (...args: unknown[]) => void calls.push(args) },
    };
    await recordProfileEditsQuietly(log, store, 2);
    await recordProfileEditsQuietly(log, store, undefined);
    expect(calls).toEqual([['u1-a', 2]]);
  });

  it('실패해도 던지지 않고 경고만 남긴다', async () => {
    const warnings: string[] = [];
    const store = {
      conversationId: 'u1-a',
      guard: {
        markConversationPlan: async () => {},
        setProfileEdits: async () => {
          throw new Error('d1');
        },
      },
    };
    await recordProfileEditsQuietly({ warn: (m: string) => void warnings.push(m), info: () => {} }, store, 0);
    expect(warnings).toHaveLength(1);
  });
});

// T17: 만들기·칸 수정이 성공하면 지난 식단표 목록에 이 대화를 표시한다 (mark step, 실패해도 결과는 그대로)
describe('markPlanQuietly', () => {
  const noProfile = { setProfileEdits: async () => {} };

  it('mark step 안에서 대화에 시작 월요일·시각과 측정 숫자(칸 수, 만들기/칸 수정)를 표시한다 (T26)', async () => {
    const marks: unknown[][] = [];
    const steps: string[] = [];
    const store = {
      conversationId: 'u1-a',
      guard: { ...noProfile, markConversationPlan: async (...args: unknown[]) => void marks.push(args) },
    };
    const step = { do: async <T,>(name: string, fn: () => Promise<T>) => (steps.push(name), fn()) };
    const now = () => '2026-11-08T12:00:00.000Z';
    await markPlanQuietly({ warn: () => {}, info: () => {} }, step, store, planA, { edited: false, now });
    await markPlanQuietly({ warn: () => {}, info: () => {} }, step, store, planA, { edited: true, now });
    expect(steps).toEqual(['mark', 'mark']);
    expect(marks).toEqual([
      ['u1-a', planA.weekStart, '2026-11-08T12:00:00.000Z', { cells: planA.cells.length, edited: false }],
      ['u1-a', planA.weekStart, '2026-11-08T12:00:00.000Z', { cells: planA.cells.length, edited: true }],
    ]);
  });

  it('표시가 실패해도 던지지 않고 경고만 남긴다', async () => {
    const warnings: string[] = [];
    const store = {
      conversationId: 'u1-a',
      guard: {
        ...noProfile,
        markConversationPlan: async () => {
          throw new Error('d1');
        },
      },
    };
    await markPlanQuietly({ warn: (m: string) => void warnings.push(m), info: () => {} }, { do: async (_n, fn) => fn() }, store, planA, {
      edited: false,
    });
    expect(warnings).toHaveLength(1);
  });
});

// tasks.md T28 (Task2 R3): 지난주 체크를 읽어 생성 선호로
describe('loadLastWeekQuietly', () => {
  const quiet = { warn: () => {}, info: () => {} };
  const conv = (conversationId: string, weekStart: string, planAt: string) => ({ conversationId, weekStart, planAt });

  async function setup({ checks = [{ day: 'mon', meal: 'lunch' }] as Slot[], consent = true } = {}) {
    const storage = new MemoryStorage();
    if (consent) await storage.savePlan(planA, 'u1-last');
    const guard = {
      planConversations: async () => [conv('u1-now', '2026-11-16', '2026-11-15T10:00:00Z'), conv('u1-last', planA.weekStart, '2026-11-09T10:00:00Z')],
      checksOf: async (_u: string, c: string) => (c === 'u1-last' ? checks : []),
    };
    const steps: string[] = [];
    const step = { do: async <T,>(name: string, fn: () => Promise<T>) => (steps.push(name), fn()) };
    return { store: { storage, userId: planA.userId, conversationId: 'u1-now', guard }, step, steps };
  }
  const input = { weekStart: '2026-11-16', profile: profileA, classes: classesA };

  it('history step에서 지난주 대화의 체크와 저장한 식단표로 선호를 만든다', async () => {
    const { store, step, steps } = await setup();
    const result = await loadLastWeekQuietly(quiet, step, store, input);
    expect(steps).toEqual(['history']);
    expect(result?.weekStart).toBe(planA.weekStart);
    expect(result?.eaten).toEqual([{ menu: '회덮밥', count: 1 }]);
  });

  it('체크가 없거나 저장한 식단표가 없으면(동의 안 함) undefined', async () => {
    const noChecks = await setup({ checks: [] });
    expect(await loadLastWeekQuietly(quiet, noChecks.step, noChecks.store, input)).toBeUndefined();
    const noConsent = await setup({ consent: false });
    expect(await loadLastWeekQuietly(quiet, noConsent.step, noConsent.store, input)).toBeUndefined();
  });

  it('읽기가 실패해도 던지지 않고 경고만 남긴다', async () => {
    const { store, step } = await setup();
    const warnings: string[] = [];
    store.guard.checksOf = async () => {
      throw new Error('d1 down');
    };
    const result = await loadLastWeekQuietly({ warn: (m: string) => void warnings.push(m), info: () => {} }, step, store, input);
    expect(result).toBeUndefined();
    expect(warnings).toEqual(['지난주 체크 읽기 실패']);
  });
});
