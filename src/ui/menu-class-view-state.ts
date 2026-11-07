// 메뉴 분류 화면이 지금 무엇을 보여 줄지 정하는 순수 함수 (스펙 4.2, 7장, tasks.md B5).
// 인터뷰가 끝난 뒤 메시지(interview-view-state.ts의 planMessages)를 받는다.
// "메뉴 분류 요청" 메시지와 classify_menus 결과를 보고, 분류가 끝나면 그 뒤 메시지는 식단표 화면(plan-view-state.ts)에 넘긴다.
import type { FlueConversationMessage } from '@flue/sdk';
import type { ClassifyToolOutput } from '../core/classify-tool-output.ts';
import { isClassifyRequest } from '../core/plan-request.ts';
import type { PlanPeriod } from '../core/period.ts';
import { isDuplicateOutput } from '../core/tool-gate.ts';
import type { MenuClassification } from '../core/types.ts';
import type { PlanViewInput } from './plan-view-state.ts';

export const CLASSIFY_TOOL = 'classify_menus';
export const CLASSIFY_ERROR = '메뉴를 분류하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

export type MenuClassViewState =
  | { kind: 'loading' }
  /** 아직 분류를 요청하지 않음. alert: 지난 요청이 실패했을 때 안내 */
  | { kind: 'idle'; alert?: string }
  /** startedAt: 요청 메시지의 서버 시각 */
  | { kind: 'classifying'; startedAt: string | undefined }
  | { kind: 'classified'; classes: MenuClassification[]; period: PlanPeriod; planMessages: FlueConversationMessage[] };

type ToolPart = Extract<FlueConversationMessage['parts'][number], { type: 'dynamic-tool' }>;

export function toMenuClassViewState({ historyReady, status, messages, settlements }: PlanViewInput): MenuClassViewState {
  if (!historyReady) return { kind: 'loading' };

  /** 아직 결과가 없는 마지막 요청 메시지 */
  let open: FlueConversationMessage | undefined;
  let alert: string | undefined;

  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      if (!isClassifyRequest(textOf(message))) continue;
      open = message;
      alert = undefined;
      continue;
    }
    for (const part of message.parts) {
      if (!isClassifyTool(part)) continue;
      if (part.state === 'output-error') alert = CLASSIFY_ERROR;
      // 에러 뒤 모델이 다시 부른 호출이 실행 중이면 아직 실패가 아니다 (리뷰 2번)
      else if (part.state !== 'output-available') alert = undefined;
      if (part.state !== 'output-available') continue;
      const output = parse<ClassifyToolOutput>(part.output);
      open = undefined;
      if (output?.status === 'ok') {
        return {
          kind: 'classified',
          classes: output.classes,
          period: output.period,
          planMessages: messages.slice(index + 1),
        };
      }
      alert = output?.message ?? CLASSIFY_ERROR;
    }
  }

  if (open) {
    const settled = !!open.submissionId && settlements.some((s) => s.submissionId === open.submissionId);
    if (alert || settled || status === 'error') return { kind: 'idle', alert: alert ?? CLASSIFY_ERROR };
    return { kind: 'classifying', startedAt: open.timestamp };
  }
  return alert ? { kind: 'idle', alert } : { kind: 'idle' };
}

/** 분류 도구 호출. 같은 응답에서 여러 번 불러 게이트에 진 호출(duplicate, T10-2)은 없는 것으로 본다 */
function isClassifyTool(part: FlueConversationMessage['parts'][number]): part is ToolPart {
  return (
    part.type === 'dynamic-tool' &&
    part.toolName === CLASSIFY_TOOL &&
    !(part.state === 'output-available' && isDuplicateOutput(part.output))
  );
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
