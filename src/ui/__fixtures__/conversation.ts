// 화면 상태 테스트용 대화 메시지 만들기
import type { FlueConversationMessage, FlueConversationSettlement } from '@flue/sdk';
import type { PlanViewInput } from '../plan-view-state.ts';

export type Part = FlueConversationMessage['parts'][number];
export type ToolPart = Extract<Part, { type: 'dynamic-tool' }>;

let seq = 0;

export const userMsg = (text: string, sub: string, timestamp?: string): FlueConversationMessage => ({
  id: `u${++seq}`,
  role: 'user',
  purpose: 'user',
  display: 'visible',
  submissionId: sub,
  ...(timestamp ? { timestamp } : {}),
  parts: [{ type: 'text', text, state: 'done' }],
});

export const assistantMsg = (sub: string, ...parts: Part[]): FlueConversationMessage => ({
  id: `a${++seq}`,
  role: 'assistant',
  purpose: 'assistant',
  display: 'visible',
  submissionId: sub,
  parts,
});

export const pendingTool = (toolName: string): ToolPart => ({
  type: 'dynamic-tool',
  toolName,
  toolCallId: `t${++seq}`,
  state: 'input-available',
  input: {},
});

export const doneTool = (toolName: string, output: unknown): ToolPart => ({
  type: 'dynamic-tool',
  toolName,
  toolCallId: `t${++seq}`,
  state: 'output-available',
  input: {},
  output,
});

export const erroredTool = (toolName: string): ToolPart => ({
  type: 'dynamic-tool',
  toolName,
  toolCallId: `t${++seq}`,
  state: 'output-error',
  input: {},
  errorText: 'boom',
});

export const settledSub = (sub: string, outcome: FlueConversationSettlement['outcome'] = 'completed'): FlueConversationSettlement => ({
  submissionId: sub,
  outcome,
});

export const viewInput = (patch: Partial<PlanViewInput>): PlanViewInput => ({
  historyReady: true,
  status: 'idle',
  messages: [],
  settlements: [],
  ...patch,
});
