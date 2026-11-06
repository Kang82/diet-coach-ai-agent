// 식단표 화면이 지금 무엇을 보여 줄지 정하는 순수 함수 (스펙 7장, 7.1).
// 식단표는 create_week_plan 도구 부분의 output으로 온다. 진행 상태는 도구 부분의 state, 제출 결과(settlements),
// useFlueAgent의 status로 판단한다. 새로고침해도 같은 대화를 다시 읽으므로 이 함수만으로 진행 중/결과를 이어 보여 준다.
import type { AgentStatus } from '@flue/react';
import type { FlueConversationMessage, FlueConversationSettlement } from '@flue/sdk';
import type { PlanToolOutput } from '../core/plan-tool-output.ts';

export const PLAN_TOOL_NAME = 'create_week_plan';

export interface PlanViewInput {
  historyReady: boolean;
  status: AgentStatus;
  messages: FlueConversationMessage[];
  settlements: FlueConversationSettlement[];
}

export type PlanViewState =
  | { kind: 'loading' }
  | { kind: 'idle' }
  /** startedAt: 사용자 메시지의 서버 시각. 보낸 직후(서버 확인 전)에는 없다 */
  | { kind: 'creating'; startedAt: string | undefined }
  | { kind: 'done'; output: Extract<PlanToolOutput, { status: 'ok' }> }
  | { kind: 'violations'; message: string }
  | { kind: 'quota'; message: string }
  | { kind: 'error'; message: string };

export const GENERIC_ERROR = '식단표를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.';

export function toPlanViewState({ historyReady, status, messages, settlements }: PlanViewInput): PlanViewState {
  if (!historyReady) return { kind: 'loading' };
  if (messages.length === 0) return { kind: 'idle' };

  const tool = lastToolCall(messages);
  if (tool?.part.state === 'output-available') return fromOutput(parseOutput(tool.part.output));
  if (tool?.part.state === 'output-error') return { kind: 'error', message: GENERIC_ERROR };
  if (status === 'error') return { kind: 'error', message: GENERIC_ERROR };

  // 결과 없이 제출이 끝났다: 실패했거나, 모델이 도구를 부르지 않고 답을 끝냈다
  const user = messages.findLast((m) => m.role === 'user');
  const submissionId = tool?.message.submissionId ?? user?.submissionId;
  if (settlements.some((s) => s.submissionId === submissionId)) return { kind: 'error', message: GENERIC_ERROR };

  // 도구 실행 중이거나, 보낸 뒤 모델이 아직 도구를 부르기 전
  return { kind: 'creating', startedAt: user?.timestamp };
}

type ToolPart = Extract<FlueConversationMessage['parts'][number], { type: 'dynamic-tool' }>;

function lastToolCall(messages: FlueConversationMessage[]) {
  for (const message of [...messages].reverse()) {
    const part = message.parts.findLast(
      (p): p is ToolPart => p.type === 'dynamic-tool' && p.toolName === PLAN_TOOL_NAME,
    );
    if (part) return { message, part };
  }
  return undefined;
}

/** 도구 출력은 객체나 JSON 문자열로 온다. */
function parseOutput(output: unknown): PlanToolOutput | undefined {
  try {
    return (typeof output === 'string' ? JSON.parse(output) : output) as PlanToolOutput;
  } catch {
    return undefined;
  }
}

function fromOutput(output: PlanToolOutput | undefined): PlanViewState {
  switch (output?.status) {
    case 'ok':
      return { kind: 'done', output };
    case 'violations':
      return { kind: 'violations', message: output.message };
    case 'quota':
      return { kind: 'quota', message: output.message };
    default:
      return { kind: 'error', message: GENERIC_ERROR };
  }
}
