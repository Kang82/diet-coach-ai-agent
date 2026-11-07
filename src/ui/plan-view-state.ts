// 식단표 화면이 지금 무엇을 보여 줄지 정하는 순수 함수 (스펙 7장, 7.1, 4.4-4).
// 식단표는 create_week_plan / edit_plan_cells 도구 부분의 output으로 온다. 진행 상태는 도구 부분의 state,
// 제출 결과(settlements), useFlueAgent의 status로 판단한다. 새로고침해도 같은 대화를 다시 읽으므로
// 이 함수만으로 진행 중/결과를 이어 보여 줄 수 있다.
import type { AgentStatus } from '@flue/react';
import type { FlueConversationMessage, FlueConversationSettlement } from '@flue/sdk';
import { isEditRequest, parseEditRequest } from '../core/edit-request.ts';
import { isPlanRequest } from '../core/plan-request.ts';
import { sameSlot } from '../core/helpers.ts';
import { DAY_LABELS, MEAL_LABELS } from '../core/labels.ts';
import type { EditToolOutput, PlanToolOutput } from '../core/plan-tool-output.ts';
import type { Plan, Slot } from '../core/types.ts';

export const CREATE_TOOL = 'create_week_plan';
export const EDIT_TOOL = 'edit_plan_cells';

export interface PlanViewInput {
  historyReady: boolean;
  status: AgentStatus;
  messages: FlueConversationMessage[];
  settlements: FlueConversationSettlement[];
}

/** 화면에 보여 줄 식단표 (만들기나 칸 수정이 성공한 마지막 결과) */
export interface PlanView {
  plan: Plan;
  summary: string[];
  notices: string[];
}

export interface EditNotice {
  tone: 'info' | 'warn' | 'error';
  messages: string[];
  /** 이번 수정으로 바뀐 칸. 화면에서 강조한다 */
  changed: Slot[];
}

export type PlanViewState =
  | { kind: 'loading' }
  | { kind: 'idle' }
  /** startedAt: 사용자 메시지의 서버 시각. 보낸 직후(서버 확인 전)에는 없다 */
  | { kind: 'creating'; startedAt: string | undefined }
  | {
      kind: 'done';
      view: PlanView;
      /** 칸 다시 추천이 진행 중 */
      editing?: { target: Slot | undefined; startedAt: string | undefined };
      /** 마지막 칸 다시 추천의 결과 */
      editNotice?: EditNotice;
    }
  /** 만들기 실패. retry: 같은 대화에 다시 보낼 만들기 메시지 본문(바꾼 분류 포함). 정해진 형식의 메시지였을 때만 */
  | { kind: 'violations'; message: string; retry?: string }
  | { kind: 'quota'; message: string; retry?: string }
  | { kind: 'error'; message: string; retry?: string };

export const GENERIC_ERROR = '식단표를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.';
export const EDIT_FAILED = '바꾸지 못했어요. 원래 식단표는 그대로예요.';
const EDIT_ERROR = '잠시 뒤 다시 시도해 주세요.';

type ToolPart = Extract<FlueConversationMessage['parts'][number], { type: 'dynamic-tool' }>;

export function toPlanViewState({ historyReady, status, messages, settlements }: PlanViewInput): PlanViewState {
  if (!historyReady) return { kind: 'loading' };
  if (messages.length === 0) return { kind: 'idle' };

  // 마지막 사용자 메시지와, 그 뒤에 온 이 화면의 도구 호출(그 메시지에 대한 답)
  const userIndex = messages.findLastIndex((m) => m.role === 'user');
  const user = messages[userIndex];
  const call = lastToolCall(messages.slice(userIndex + 1));
  const settled = !!user?.submissionId && settlements.some((s) => s.submissionId === user.submissionId);
  const view = lastPlanView(messages);

  if (view && user && isEditRequest(textOf(user))) {
    return { kind: 'done', view, ...editState(user, call, settled, status) };
  }

  // 실패하면 같은 만들기 메시지를 다시 보낼 수 있게 한다 (리뷰 3번). 분류가 없어서 실패한 경우는 다시 보내도 같다
  const retry = user && isPlanRequest(textOf(user)) ? { retry: textOf(user) } : {};
  if (call?.state === 'output-available') {
    const output = parse<PlanToolOutput>(call.output);
    if (output?.status === 'ok') return { kind: 'done', view: toView(output) };
    if (output?.status === 'violations') return { kind: 'violations', message: output.message, ...retry };
    if (output?.status === 'quota') return { kind: 'quota', message: output.message, ...retry };
    if (output?.status === 'timeout' || output?.status === 'error') return { kind: 'error', message: output.message, ...retry };
    if (output?.status === 'no_classes' || output?.status === 'bad_request') return { kind: 'error', message: output.message };
    return { kind: 'error', message: GENERIC_ERROR, ...retry };
  }
  if (call?.state === 'output-error' || status === 'error' || settled) return { kind: 'error', message: GENERIC_ERROR, ...retry };
  // 도구 실행 중이거나, 보낸 뒤 모델이 아직 도구를 부르기 전
  return { kind: 'creating', startedAt: user?.timestamp };
}

function editState(
  user: FlueConversationMessage,
  call: ToolPart | undefined,
  settled: boolean,
  status: AgentStatus,
): Pick<Extract<PlanViewState, { kind: 'done' }>, 'editing' | 'editNotice'> {
  if (call?.state === 'output-available') return { editNotice: editNotice(parse<EditToolOutput>(call.output)) };
  if (call?.state === 'output-error' || status === 'error' || settled) {
    return { editNotice: { tone: 'error', messages: [EDIT_FAILED, EDIT_ERROR], changed: [] } };
  }
  return { editing: { target: parseEditRequest(textOf(user))?.target, startedAt: user.timestamp } };
}

function editNotice(output: EditToolOutput | undefined): EditNotice {
  if (!output) return { tone: 'error', messages: [EDIT_FAILED, EDIT_ERROR], changed: [] };
  if (output.status !== 'ok') return { tone: 'error', messages: [EDIT_FAILED, output.message], changed: [] };

  const messages = [`${output.targets.map(slotLabel).join(', ')}을 바꿨어요.`];
  let tone: EditNotice['tone'] = 'info';
  const others = output.changed.filter((c) => !output.targets.some((t) => sameSlot(t, c)));
  if (others.length > 0) {
    messages.push(`규칙을 지키려고 ${others.map(slotLabel).join(', ')}도 함께 바꿨어요.`);
    tone = 'warn';
  }
  if (output.unchangedTargets.length > 0) {
    messages[0] = `${output.unchangedTargets.map(slotLabel).join(', ')}은 같은 메뉴로 남았어요. 요청을 반영하지 못했어요.`;
    tone = 'warn';
  }
  return { tone, messages, changed: output.changed };
}

/** 대화 전체에서 성공한 결과(만들기 또는 칸 수정) 중 마지막 식단표 */
function lastPlanView(messages: FlueConversationMessage[]): PlanView | undefined {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (!isPlanTool(part) || part.state !== 'output-available') continue;
      const output = parse<PlanToolOutput | EditToolOutput>(part.output);
      if (output?.status === 'ok') return toView(output);
    }
  }
  return undefined;
}

function lastToolCall(messages: FlueConversationMessage[]): ToolPart | undefined {
  for (const message of [...messages].reverse()) {
    const part = message.parts.findLast(isPlanTool);
    if (part) return part;
  }
  return undefined;
}

function isPlanTool(part: FlueConversationMessage['parts'][number]): part is ToolPart {
  return part.type === 'dynamic-tool' && (part.toolName === CREATE_TOOL || part.toolName === EDIT_TOOL);
}

function toView(output: { plan: Plan; summary: string[]; notices: string[] }): PlanView {
  return { plan: output.plan, summary: output.summary, notices: output.notices };
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

export function slotLabel(slot: Slot): string {
  return `${DAY_LABELS[slot.day]} ${MEAL_LABELS[slot.meal]}`;
}
