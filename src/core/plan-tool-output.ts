// 식단표 생성 도구(create_week_plan)의 결과 모양 (스펙 4.4, 7.1).
// 도구가 만들고, 화면(src/ui)과 평가 세트(src/evals)가 읽는다. 대화 메시지의 dynamic-tool 부분 output으로 전달된다.
import type { TokenUsage } from './plan-generator.ts';
import type { Plan, Violation } from './types.ts';

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
  | { status: 'quota'; message: string; stats: PlanToolStats };
