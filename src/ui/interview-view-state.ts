// 인터뷰 화면이 지금 무엇을 보여 줄지 정하는 순수 함수 (스펙 4.1, 7장, tasks.md B4).
// 인터뷰 단계 진행은 화면이 들고 있고(interview-form-state.ts), 대화에는 끝난 뒤 보낸 제출 메시지와 submit_interview 결과만 있다.
// 인터뷰가 끝나면(done) 그 뒤 메시지는 식단표 화면(plan-view-state.ts)에 넘긴다.
import type { FlueConversationMessage } from '@flue/sdk';
import { isInterviewSubmission } from '../core/interview-form.ts';
import type { InterviewMessage } from '../core/interview-text.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import type { ServerAsk } from './interview-form-state.ts';
import type { PlanViewInput } from './plan-view-state.ts';

export const INTERVIEW_TOOL = 'submit_interview';
export const INTERVIEW_ERROR = '답을 보내지 못했어요. 잠시 뒤 다시 보내 주세요.';

export type InterviewViewState =
  | { kind: 'loading' }
  /** 화면에서 인터뷰 진행. serverAsk: 서버가 목표를 다시 물음, alert: 제출 실패·한도 초과 안내 */
  | { kind: 'form'; serverAsk?: ServerAsk; alert?: string }
  | { kind: 'submitting' }
  | { kind: 'stopped'; message: InterviewMessage }
  | { kind: 'done'; message: InterviewMessage; summary: string[]; planMessages: FlueConversationMessage[] };

type ToolPart = Extract<FlueConversationMessage['parts'][number], { type: 'dynamic-tool' }>;

export function toInterviewViewState({ historyReady, status, messages, settlements }: PlanViewInput): InterviewViewState {
  if (!historyReady) return { kind: 'loading' };

  let last: { id: string; output: InterviewToolOutput } | undefined;
  /** 아직 결과가 없는 마지막 제출 메시지 */
  let open: FlueConversationMessage | undefined;
  let failed = false;

  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      if (!isInterviewSubmission(textOf(message))) continue;
      open = message;
      failed = false;
      last = undefined;
      continue;
    }
    for (const part of message.parts) {
      if (!isInterviewTool(part)) continue;
      if (part.state === 'output-error') failed = true;
      if (part.state !== 'output-available') continue;
      const output = parse<InterviewToolOutput>(part.output);
      if (!output) {
        failed = true;
        continue;
      }
      open = undefined;
      last = { id: part.toolCallId, output };
      if (output.status === 'done') {
        return { kind: 'done', message: output.message, summary: output.summary, planMessages: messages.slice(index + 1) };
      }
    }
  }

  if (open) {
    const settled = !!open.submissionId && settlements.some((s) => s.submissionId === open.submissionId);
    if (failed || settled || status === 'error') return { kind: 'form', alert: INTERVIEW_ERROR };
    return { kind: 'submitting' };
  }
  if (!last) return { kind: 'form' };
  switch (last.output.status) {
    case 'stop':
      return { kind: 'stopped', message: last.output.message };
    case 'ask':
      return { kind: 'form', serverAsk: { id: last.id, output: last.output } };
    default:
      return { kind: 'form', alert: last.output.message.text };
  }
}

function isInterviewTool(part: FlueConversationMessage['parts'][number]): part is ToolPart {
  return part.type === 'dynamic-tool' && part.toolName === INTERVIEW_TOOL;
}

function textOf(message: FlueConversationMessage): string {
  return message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
}

/** 도구 출력은 객체나 JSON 문자열로 온다. */
function parse<T>(output: unknown): T | undefined {
  try {
    const value = typeof output === 'string' ? JSON.parse(output) : output;
    return value && typeof value === 'object' ? (value as T) : undefined;
  } catch {
    return undefined;
  }
}
