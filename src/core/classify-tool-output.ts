// 메뉴 분류 도구(classify_menus)의 결과 모양 (스펙 4.2, tasks.md B5).
// 도구가 만들고 화면(src/ui/menu-class-view-state.ts)이 읽는다. 대화 메시지의 dynamic-tool 부분 output으로 전달된다.
import type { EventIssue, PlanPeriod } from './period.ts';
import type { TokenUsage } from './plan-generator.ts';
import type { MenuClassification } from './types.ts';

export interface ClassifyToolStats {
  seconds: number;
  usages: TokenUsage[];
  neurons: number;
}

export type ClassifyToolOutput =
  /** classes: 분류 대상 순서. 외식 끼니가 없으면 빈 배열. period: 이 요청으로 정한 기간과 일정 (B6) */
  | { status: 'ok'; classes: MenuClassification[]; period: PlanPeriod; stats: ClassifyToolStats }
  | { status: 'quota'; message: string; stats: ClassifyToolStats }
  /** 시간 제한을 넘겨 멈춤 (B6). 다시 요청하면 된다 */
  | { status: 'timeout'; message: string; stats: ClassifyToolStats }
  /** 인터뷰가 끝나지 않았음 */
  | { status: 'no_interview'; message: string; stats: ClassifyToolStats }
  /** 요청 형식이 틀렸거나 일정이 맞지 않음. LLM을 부르지 않는다 */
  | { status: 'bad_request'; message: string; issues: EventIssue[]; stats: ClassifyToolStats };
