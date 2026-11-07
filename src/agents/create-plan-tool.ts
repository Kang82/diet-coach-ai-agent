// 스펙 4.3, 4.4. 1주일 식단표를 만드는 도구.
// 도구 안에서 점검·다시 추천 루프(createPlan)를 돌리고, 결과를 도구 출력으로 남긴다.
// 성공하면 칸 수정(edit_plan_cells)이 고칠 수 있게 에이전트 상태에도 저장한다.
// 프로필은 끝난 인터뷰, 분류는 classify_menus가 저장한 분류에 화면에서 바꾼 분류(식단표 만들기 메시지)를 반영한 것이다 (tasks.md B5).
import { defineTool, type DeliveredMessage } from '@flue/runtime';
import * as v from 'valibot';
import { formatCheckSummary } from '../core/format-summary.ts';
import type { InterviewResult } from '../core/interview.ts';
import { planWeekStart, type PlanPeriod } from '../core/period.ts';
import { resolvePlanClasses } from '../core/plan-request.ts';
import type { PlanToolOutput } from '../core/plan-tool-output.ts';
import type { MenuClassification } from '../core/types.ts';
import { PLAN_TOOL_BUDGETS } from '../core/llm-timeout.ts';
import { createPlan } from '../core/plan-loop.ts';
import { buildPlanNotices } from '../core/plan-notices.ts';
import { QUOTA_EXCEEDED_MESSAGE } from '../core/quota.ts';
import type { NeuronMeter } from './metered-harness.ts';
import { persistPlan } from '../storage/persist.ts';
import { metered, persistQuietly, pickGenerator, planContext, planFailure, toJson, toolStats, type SavePlan, type UserStore } from './plan-tool-support.ts';

export const CREATE_PLAN_TOOL = 'create_week_plan';

export const NO_CLASSES_MESSAGE = '메뉴 분류를 먼저 확인해 주세요.';

export const BAD_PLAN_REQUEST_MESSAGE = '식단표 요청을 읽지 못했어요. 분류 확인 화면에서 다시 눌러 주세요.';

export function createWeekPlanTool({
  interviewResult,
  menuClasses,
  period,
  saveClasses,
  savePlan,
  delivery,
  meter,
  store,
}: {
  interviewResult: InterviewResult | undefined;
  menuClasses: MenuClassification[] | undefined;
  /** 기간 선택(classify_menus가 저장). 없으면 다음 주, 일정 없음 */
  period: PlanPeriod | undefined;
  saveClasses: (classes: MenuClassification[]) => void;
  savePlan: SavePlan;
  delivery: DeliveredMessage;
  /** LLM 사용량을 전체 안전선 카운터에 더한다 (스펙 11.4-3) */
  meter: NeuronMeter;
  /** 동의한 프로필이 있으면 식단표를 서버에 저장한다 (T6-2) */
  store?: UserStore;
}) {
  return defineTool({
    name: CREATE_PLAN_TOOL,
    description: '사용자의 프로필로 1주일 식단표를 만들고 규칙을 점검한다. 몇 분 걸린다.',
    // 시작일은 모델에게 맡기지 않는다. 입력으로 열어 두었더니 gemma가 오늘 날짜(금요일)를 넣었다 (2026-11-06).
    // 기간 선택 화면(T5-3)이 생기면 그쪽에서 정한 값을 넘긴다.
    input: v.object({}),
    harness: true,
    async run({ harness, log }) {
      // 정해진 형식이 아닌 메시지("식단표 만들어 줘" 등)면 바꾼 분류 없이 저장된 분류를 그대로 쓴다.
      // `식단표 만들기:`인데 형식이 깨졌으면 바꾼 분류를 버리지 않고 bad_request로 답한다 (T9-1)
      const resolved = resolvePlanClasses(delivery.kind === 'user' ? delivery.body : undefined, interviewResult?.meals, menuClasses);
      if (resolved.kind === 'bad_request') {
        const output: PlanToolOutput = { status: 'bad_request', message: BAD_PLAN_REQUEST_MESSAGE };
        return { output: toJson(output), terminate: true };
      }
      if (!interviewResult || resolved.kind === 'no_classes') {
        const output: PlanToolOutput = { status: 'no_classes', message: NO_CLASSES_MESSAGE };
        return { output: toJson(output), terminate: true };
      }
      const { classes } = resolved;
      const ctx = planContext(interviewResult, classes);
      const startedAt = Date.now();

      try {
        const result = await createPlan(pickGenerator(metered(harness, meter, log)), ctx, {
          planId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          weekStart: planWeekStart(period?.weekStart, new Date()),
          events: structuredClone(period?.events ?? []),
          // 도구 전체 시간 상한 (tasks.md T8-4)
          budget: { totalMs: PLAN_TOOL_BUDGETS.createPlan, now: Date.now },
        });
        const stats = toolStats(startedAt, result, log);
        log.info('식단표 생성 끝', { ok: result.ok, ...stats });

        if (result.ok) {
          // 칸 수정이 같은 분류로 점검하도록 사용자가 바꾼 분류를 저장한다. 실패하면 저장된 분류는 그대로 둔다 (T9-2)
          saveClasses(classes);
          savePlan(result.plan);
          if (store) {
            const plan = result.plan;
            await persistQuietly(log, '식단표', () => persistPlan(store.storage, store.userId, plan));
          }
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
        // 던지면 바깥 모델이 이 도구를 다시 부를 수 있다 (리뷰 1번). 결과로 답하고 턴을 끝낸다
        return { output: toJson(planFailure(startedAt, error, log)), terminate: true };
      }
    },
  });
}
