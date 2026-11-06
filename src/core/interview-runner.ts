// 인터뷰 제출 (스펙 4.1, tasks.md B4): 화면에서 끝낸 초안 → 목표 메모 확인(LLM, 메모가 있을 때만) → applyTurn.
// LLM 호출은 GoalNoteChecker 포트 뒤에 둔다 (plan-generator.ts와 같은 방식). 도구(agents/interview-tool.ts)는 결과 저장만 한다.
import { nextField, type InterviewResult } from './interview.ts';
import type { InterviewSubmission } from './interview-form.ts';
import { goalNoteUpdate, type GoalNoteCheck, type GoalNoteInput } from './interview-note.ts';
import { formatTurnReply, summarizeInterviewResult, type InterviewMessage } from './interview-text.ts';
import { applyTurn, type TurnNext } from './interview-turn.ts';
import type { LlmResult, TokenUsage } from './plan-generator.ts';
import { QUOTA_EXCEEDED_MESSAGE, QuotaExceededError } from './quota.ts';
import type { InterviewState, InterviewUpdate } from './types.ts';

export interface GoalNoteChecker {
  check(input: GoalNoteInput): Promise<LlmResult<GoalNoteCheck>>;
}

export const EMPTY_INTERVIEW: InterviewState = { draft: {}, stopFlags: [], menuFollowUps: [] };

export type AskNext = Extract<TurnNext, { kind: 'ask' }>;

export type InterviewSubmitOutcome =
  | { kind: 'done'; message: InterviewMessage; result: InterviewResult; summary: string[]; usages: TokenUsage[] }
  | { kind: 'stop'; message: InterviewMessage; usages: TokenUsage[] }
  /** 목표를 다시 묻는다 (무리한 목표, 지원하지 않는 목표). 화면은 state에서 목표 단계로 돌아간다 */
  | { kind: 'ask'; message: InterviewMessage; state: InterviewState; next: AskNext; usages: TokenUsage[] }
  /** 한도 초과. 같은 제출을 나중에 다시 보내면 된다 */
  | { kind: 'quota'; message: InterviewMessage; usages: TokenUsage[] };

/** 끝나지 않은 초안이면 에러를 던진다 (화면은 끝난 뒤에만 제출한다) */
export async function submitInterview(checker: GoalNoteChecker, submission: InterviewSubmission): Promise<InterviewSubmitOutcome> {
  if (nextField(submission.draft) !== null) throw new Error('인터뷰가 끝나지 않은 초안입니다');
  const state: InterviewState = { draft: structuredClone(submission.draft), stopFlags: [...submission.stopFlags], menuFollowUps: [] };

  let update: InterviewUpdate = { filled: {}, stopFlags: [], turnFlags: [] };
  const usages: TokenUsage[] = [];
  const note = submission.draft.goalNote?.trim();
  if (note && state.stopFlags.length === 0) {
    try {
      const checked = await checker.check({ goals: submission.draft.goals ?? [], note });
      usages.push(checked.usage);
      update = goalNoteUpdate(checked.value);
    } catch (error) {
      if (error instanceof QuotaExceededError) return { kind: 'quota', message: { text: QUOTA_EXCEEDED_MESSAGE }, usages };
      throw error;
    }
  }

  const turn = applyTurn(state, update);
  const message = formatTurnReply(turn.next, turn.notices);
  switch (turn.next.kind) {
    case 'done':
      return { kind: 'done', message, result: turn.next.result, summary: summarizeInterviewResult(turn.next.result), usages };
    case 'stop':
      return { kind: 'stop', message, usages };
    case 'ask':
      return { kind: 'ask', message, state: turn.state, next: turn.next, usages };
  }
}
