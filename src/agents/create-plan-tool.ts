// 스펙 4.3, 4.4. 1주일 식단표를 만드는 도구.
// 도구 안에서 점검·다시 추천 루프(createPlan)를 돌리고, 결과를 도구 출력으로 남긴다.
// 성공하면 칸 수정(edit_plan_cells)이 고칠 수 있게 에이전트 상태에도 저장한다.
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { formatCheckSummary } from '../core/format-summary.ts';
import { nextMondayKst } from '../core/helpers.ts';
import { createPlan, PlanLoopError } from '../core/plan-loop.ts';
import { buildPlanNotices } from '../core/plan-notices.ts';
import { QUOTA_EXCEEDED_MESSAGE } from '../core/quota.ts';
import { countNeurons, pickGenerator, planContext, toJson, toolStats, type SavePlan } from './plan-tool-support.ts';

export const CREATE_PLAN_TOOL = 'create_week_plan';

export function createWeekPlanTool({ savePlan }: { savePlan: SavePlan }) {
  return defineTool({
    name: CREATE_PLAN_TOOL,
    description: '사용자의 프로필로 1주일 식단표를 만들고 규칙을 점검한다. 몇 분 걸린다.',
    // 시작일은 모델에게 맡기지 않는다. 입력으로 열어 두었더니 gemma가 오늘 날짜(금요일)를 넣었다 (2026-11-06).
    // 기간 선택 화면(T5-3)이 생기면 그쪽에서 정한 값을 넘긴다.
    input: v.object({}),
    harness: true,
    async run({ harness, log }) {
      const ctx = planContext();
      const startedAt = Date.now();

      try {
        const result = await createPlan(pickGenerator(harness), ctx, {
          planId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          weekStart: nextMondayKst(new Date()),
          events: [],
        });
        const stats = toolStats(startedAt, result, log);
        log.info('식단표 생성 끝', { ok: result.ok, ...stats });

        if (result.ok) {
          savePlan(result.plan);
          return {
            output: toJson({
              status: 'ok',
              plan: result.plan,
              summary: formatCheckSummary(result.check.stats, ctx.profile),
              notices: buildPlanNotices(ctx.profile),
              stats,
            }),
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
          log.error('식단표 생성 중 LLM 호출 실패', { message: error.message, neurons: countNeurons(error.usages, log) });
        }
        throw error;
      }
    },
  });
}
