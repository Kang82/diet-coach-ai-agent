// 식단표 생성 도구(create_week_plan)의 결과 모양 (스펙 4.4, 7.1).
// 도구가 만들고, 화면(src/ui)과 평가 세트(src/evals)가 읽는다. 대화 메시지의 dynamic-tool 부분 output으로 전달된다.
import type { TokenUsage } from './plan-generator.ts';
import type { MealKey, Plan, Slot, Violation } from './types.ts';

export interface PlanToolStats {
  seconds: number;
  regenerations: number;
  usages: TokenUsage[];
  neurons: number;
  /** 도구 전체 시간 예산이 모자라 다시 추천을 멈췄음 (tasks.md T8-4). 로그와 평가 기록용 */
  stoppedForTime?: true;
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
  | { status: 'no_classes'; message: string }
  /** `식단표 만들기:` 메시지 형식이 깨짐 (tasks.md T9-1). LLM을 부르지 않는다. 같은 메시지를 다시 보내도 같아서 다시 시도가 없다 */
  | { status: 'bad_request'; message: string }
  /** 모델이 한 응답에서 이 도구를 여러 번 불러 게이트에 진 호출 (tasks.md T10-2). LLM을 부르지 않는다. 화면은 건너뛴다 */
  | { status: 'duplicate'; message: string }
  /**
   * 외식 메뉴가 적어 규칙을 지키는 식단표가 없음 (B15 T11-3, plan-feasibility.ts). LLM을 부르지 않는다.
   * shortMeals: 메뉴를 하나 더 넣으면 가능해지는 끼니. 같은 조건이면 결과가 같아 다시 시도가 없다
   */
  | { status: 'infeasible'; message: string; shortMeals: MealKey[] };

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
      status: 'violations' | 'quota' | 'timeout' | 'error' | 'invalid_targets' | 'stale_plan' | 'no_plan' | 'bad_request'
        /** 같은 응답의 중복 호출 (T10-2). 화면은 건너뛴다 */
        | 'duplicate';
      message: string;
      targets?: Slot[];
      stats?: PlanToolStats;
    };
