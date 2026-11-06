// 인터뷰 제출 도구(submit_interview)의 결과 모양 (스펙 4.1, tasks.md B4).
// 도구가 만들고 화면(src/ui/interview-view-state.ts)이 읽는다. 대화 메시지의 dynamic-tool 부분 output으로 전달된다.
import type { AskNext } from './interview-runner.ts';
import type { InterviewMessage } from './interview-text.ts';
import type { TokenUsage } from './plan-generator.ts';
import type { InterviewState } from './types.ts';

export interface InterviewToolStats {
  seconds: number;
  usages: TokenUsage[];
  neurons: number;
}

export type InterviewToolOutput =
  /** summary: summarizeInterviewResult 결과 */
  | { status: 'done'; message: InterviewMessage; summary: string[]; stats: InterviewToolStats }
  /** 중단 (분기 1). 이 대화에서는 식단표를 만들지 않는다 */
  | { status: 'stop'; message: InterviewMessage; stats: InterviewToolStats }
  /** 목표를 다시 묻는다. 화면은 state와 next로 목표 단계부터 이어 간다 */
  | { status: 'ask'; message: InterviewMessage; state: InterviewState; next: AskNext; stats: InterviewToolStats }
  /** 한도 초과. 같은 제출을 나중에 다시 보내면 된다 */
  | { status: 'quota'; message: InterviewMessage; stats: InterviewToolStats }
  /** 제출 메시지 형식이 틀렸거나 끝나지 않은 초안 */
  | { status: 'bad_request'; message: InterviewMessage; stats: InterviewToolStats };
