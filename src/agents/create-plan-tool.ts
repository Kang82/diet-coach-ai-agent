// 스펙 4.3, 4.4. 1주일 식단표를 만드는 도구.
// 도구 안에서 점검·다시 추천 루프(createPlan)를 돌리고, 결과를 도구 출력으로 남긴다.
// 프로필은 인터뷰(T4)가 생기기 전까지 페르소나 A로 고정한다 (tasks.md T2).
import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { classesA, profileA } from '../core/__fixtures__/persona-a.ts';
import { buildCriteria } from '../core/criteria.ts';
import { formatCheckSummary } from '../core/format-summary.ts';
import { nextMondayKst } from '../core/helpers.ts';
import { totalNeurons } from '../core/neurons.ts';
import { createPlan, PlanLoopError } from '../core/plan-loop.ts';
import type { TokenUsage } from '../core/plan-generator.ts';
import { QUOTA_EXCEEDED_MESSAGE } from '../core/quota.ts';
import { createFluePlanGenerator } from './flue-plan-generator.ts';
import { NEURON_PRICES } from './models.ts';

export const createWeekPlanTool = defineTool({
  name: 'create_week_plan',
  description: '사용자의 프로필로 1주일 식단표를 만들고 규칙을 점검한다. 몇 분 걸린다.',
  input: v.object({
    weekStart: v.optional(v.pipe(v.string(), v.isoDate()), undefined),
  }),
  harness: true,
  async run({ harness, data, log }) {
    const profile = structuredClone(profileA);
    const ctx = { profile, rules: buildCriteria(profile.goals), classes: structuredClone(classesA) };
    const weekStart = data.weekStart ?? nextMondayKst(new Date());
    const startedAt = Date.now();

    const neurons = (usages: TokenUsage[]) =>
      Math.round(
        totalNeurons(usages, NEURON_PRICES, {
          unknownModel: 'max-price',
          onUnknownModel: (model) => log.warn('단가를 모르는 모델이라 가장 비싼 단가로 셈', { model }),
        }),
      );

    try {
      const result = await createPlan(createFluePlanGenerator(harness), ctx, {
        planId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        weekStart,
        events: [],
      });
      const stats = {
        seconds: Math.round((Date.now() - startedAt) / 1000),
        regenerations: result.regenerations,
        usages: result.usages,
        neurons: neurons(result.usages),
      };
      log.info('식단표 생성 끝', { ok: result.ok, ...stats });

      if (result.ok) {
        return {
          output: toJson({ status: 'ok', plan: result.plan, summary: formatCheckSummary(result.check.stats, profile), stats }),
          // 식단표는 도구 결과로 화면에 보여 준다. 모델이 14칸을 다시 풀어 쓰며 Neuron을 쓰지 않게 여기서 끝낸다.
          terminate: true,
        };
      }
      if (result.reason === 'quota') {
        return { output: toJson({ status: 'quota', message: QUOTA_EXCEEDED_MESSAGE, stats }), terminate: true };
      }
      return {
        output: toJson({
          status: 'violations',
          message: '조건을 모두 맞추는 식단표를 만들기 어려웠어요.',
          violations: result.check.violations,
          lastPlan: result.lastPlan,
          stats,
        }),
        terminate: true,
      };
    } catch (error) {
      if (error instanceof PlanLoopError) {
        log.error('식단표 생성 중 LLM 호출 실패', { message: error.message, neurons: neurons(error.usages) });
      }
      throw error;
    }
  },
});

/** 도구 출력은 JSON 값이어야 한다. 인터페이스(Plan 등)를 JsonValue로 넘기려고 한 번 직렬화한다. */
function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
