// 스펙 4.4-4. 사용자가 고른 칸을 다시 추천하는 도구.
// 어떤 칸을 어떻게 바꿀지는 모델이 옮겨 적지 않고, 화면이 보낸 메시지(useDelivery)를 직접 해석한다 (core/edit-request.ts).
// 고칠 식단표는 에이전트 상태(usePersistentState 'plan')에서 읽고, 성공하면 바꾼다. 실패하면 식단표는 그대로다.
import { defineTool, type DeliveredMessage } from '@flue/runtime';
import * as v from 'valibot';
import { parseEditRequest } from '../core/edit-request.ts';
import { formatCheckSummary } from '../core/format-summary.ts';
import { editPlanCells } from '../core/plan-loop.ts';
import { buildPlanNotices } from '../core/plan-notices.ts';
import type { EditToolOutput } from '../core/plan-tool-output.ts';
import { QUOTA_EXCEEDED_MESSAGE } from '../core/quota.ts';
import type { InterviewResult } from '../core/interview.ts';
import type { MenuClassification, Plan } from '../core/types.ts';
import type { NeuronMeter } from './metered-harness.ts';
import { persistPlan } from '../storage/persist.ts';
import { metered, persistQuietly, pickGenerator, planContext, planFailure, toJson, toolStats, type SavePlan, type UserStore } from './plan-tool-support.ts';

export const EDIT_PLAN_TOOL = 'edit_plan_cells';

export function editPlanCellsTool({
  interviewResult,
  menuClasses,
  plan,
  savePlan,
  delivery,
  meter,
  store,
}: {
  interviewResult: InterviewResult | undefined;
  /** 식단표를 만들 때 저장한 분류 (사용자 수정 반영) */
  menuClasses: MenuClassification[] | undefined;
  plan: Plan | undefined;
  savePlan: SavePlan;
  delivery: DeliveredMessage;
  /** LLM 사용량을 전체 안전선 카운터에 더한다 (스펙 11.4-3) */
  meter: NeuronMeter;
  /** 동의한 프로필이 있으면 식단표를 서버에 저장한다 (T6-2) */
  store?: UserStore;
}) {
  return defineTool({
    name: EDIT_PLAN_TOOL,
    description: '사용자가 고른 식단표 칸을 다시 추천한다. 어떤 칸인지는 도구가 사용자 메시지에서 직접 읽는다. 1~2분 걸린다.',
    input: v.object({}),
    harness: true,
    async run({ harness, log }) {
      const done = (output: EditToolOutput) => ({ output: toJson(output), terminate: true });

      const parsed = delivery.kind === 'user' ? parseEditRequest(delivery.body) : undefined;
      if (!parsed) return done({ status: 'bad_request', message: '어떤 칸을 바꿀지 알 수 없어요. 칸의 "다시 추천" 버튼을 눌러 주세요.' });
      const targets = [parsed.target];
      if (!plan || !interviewResult || !menuClasses) {
        return done({ status: 'no_plan', message: '바꿀 식단표가 없어요. 먼저 식단표를 만들어 주세요.', targets });
      }

      const ctx = planContext(interviewResult, menuClasses);
      const startedAt = Date.now();
      try {
        const result = await editPlanCells(pickGenerator(metered(harness, meter, log)), ctx, plan, { targets, userRequest: parsed.request });
        const stats = toolStats(startedAt, result, log);
        log.info('칸 다시 추천 끝', { ok: result.ok, reason: result.ok ? undefined : result.reason, ...stats });

        if (result.ok) {
          savePlan(result.plan);
          if (store) {
            const plan = result.plan;
            await persistQuietly(log, '고친 식단표', () => persistPlan(store.storage, store.userId, plan));
          }
          return done({
            status: 'ok',
            plan: result.plan,
            summary: formatCheckSummary(result.check.stats, ctx.profile),
            notices: buildPlanNotices(ctx.profile),
            targets,
            changed: result.changed,
            unchangedTargets: result.unchangedTargets,
            stats,
          });
        }
        switch (result.reason) {
          case 'quota':
            return done({ status: 'quota', message: QUOTA_EXCEEDED_MESSAGE, targets, stats });
          case 'invalid_targets':
            return done({ status: 'invalid_targets', message: '이 칸은 다시 추천할 수 없어요.', targets, stats });
          case 'stale_plan':
            return done({
              status: 'stale_plan',
              message: '식단 조건이 바뀌어 이 식단표는 고칠 수 없어요. 식단표를 새로 만들어 주세요.',
              targets,
              stats,
            });
          case 'violations':
            return done({
              status: 'violations',
              message: '규칙에 맞는 다른 메뉴를 찾지 못했어요.',
              targets,
              stats,
            });
        }
      } catch (error) {
        // 던지면 바깥 모델이 이 도구를 다시 부를 수 있다 (리뷰 1번). 결과로 답하고 턴을 끝낸다
        return done({ ...planFailure(startedAt, error, log), targets });
      }
    },
  });
}
