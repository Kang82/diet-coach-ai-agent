// 식단표 생성 도구(create_week_plan)의 결과 모양 (스펙 4.4, 7.1).
// 도구가 만들고, 화면(src/ui)과 평가 세트(src/evals)가 읽는다. 대화 메시지의 dynamic-tool 부분 output으로 전달된다.
import type { TokenUsage } from './plan-generator.ts';
import type { Plan, Slot, Violation } from './types.ts';

export interface PlanToolStats {
  seconds: number;
  regenerations: number;
  usages: TokenUsage[];
  neurons: number;
}

export type PlanToolOutput =
  | {
      status: 'ok';
      plan: Plan;
      /** formatCheckSummary 결과 */
      summary: string[];
      /** buildPlanNotices 결과 */
      notices: string[];
      stats: PlanToolStats;
    }
  | {
      status: 'violations';
      message: string;
      violations: Violation[];
      /** 평가 기록용. 화면에는 보여 주지 않는다 (스펙 4.4: 넘으면 식단표를 내보내지 않음) */
      lastPlan: Plan;
      stats: PlanToolStats;
    }
  | { status: 'quota'; message: string; stats: PlanToolStats }
  /** 시간 초과나 그 밖의 실패 (리뷰 1번). 도구는 던지지 않고 이 결과로 턴을 끝낸다 */
  | { status: 'timeout' | 'error'; message: string; stats: PlanToolStats }
  /** 인터뷰나 메뉴 분류가 끝나지 않았음. LLM을 부르지 않는다 */
  | { status: 'no_classes'; message: string };

/**
 * 칸 다시 추천 도구(edit_plan_cells)의 결과 (스펙 4.4-4).
 * 실패하면 식단표는 바뀌지 않는다. 화면은 직전 식단표를 그대로 보여 주고 message로 알린다.
 */
export type EditToolOutput =
  | {
      status: 'ok';
      plan: Plan;
      summary: string[];
      notices: string[];
      /** 사용자가 고른 칸 */
      targets: Slot[];
      /** 수정 전과 달라진 칸. 고르지 않은 칸이 있으면 화면에서 알린다 */
      changed: Slot[];
      /** 고른 칸 중 메뉴가 그대로인 칸 */
      unchangedTargets: Slot[];
      stats: PlanToolStats;
    }
  | {
      status: 'violations' | 'quota' | 'timeout' | 'error' | 'invalid_targets' | 'stale_plan' | 'no_plan' | 'bad_request';
      message: string;
      targets?: Slot[];
      stats?: PlanToolStats;
    };
