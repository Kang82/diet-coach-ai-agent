// 인터뷰 화면의 진행 상태 (스펙 4.1, tasks.md B4). 순수 함수.
// 인터뷰는 서버 왕복 없이 화면에서 단계마다 applyTurn을 돌린다. 진행 상태는 localStorage(대화 ID별)에 두어 새로고침해도 이어진다.
// 제출 뒤 서버가 목표를 다시 물으면(ask) 그 상태에서 이어 간다.
import { EMPTY_INTERVIEW } from '../core/interview-runner.ts';
import { formatTurnReply, type InterviewMessage } from '../core/interview-text.ts';
import { applyTurn, type TurnNext } from '../core/interview-turn.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import type { InterviewResult } from '../core/interview.ts';
import { draftKey } from './browser-store.ts';
import { draftFromResult, reopenSection, type ProfileSection } from '../core/profile-edit.ts';
import { sameMealKey } from '../core/helpers.ts';
import type { InterviewState, InterviewUpdate } from '../core/types.ts';

export interface FormProgress {
  state: InterviewState;
  next: TurnNext;
  /** 지금 단계 위에 보여 줄 안내 (다시 묻는 이유, 중단 안내 등) */
  message?: InterviewMessage;
  /** 이어받은 서버 ask의 도구 호출 ID. 같은 ask를 두 번 이어받지 않으려고 둔다 */
  basedOn?: string;
  /** 메뉴 "고치기"로 다시 물을 때 입력란에 미리 채울 이전 메뉴 (B16: 메뉴 하나를 더하려고 전부 다시 쓰지 않게). 답하면 없어진다 */
  prefill?: string;
}

export type ServerAsk = { id: string; output: Extract<InterviewToolOutput, { status: 'ask' }> };

export function progressKey(conversationId: string): string {
  return draftKey('interview', conversationId);
}

export function startProgress(): FormProgress {
  return { state: structuredClone(EMPTY_INTERVIEW), next: { kind: 'ask', field: 'goals' } };
}

export function advance(progress: FormProgress, update: InterviewUpdate): FormProgress {
  const turn = applyTurn(progress.state, update);
  const explain = turn.next.kind === 'stop' || turn.notices.length > 0 || (turn.next.kind === 'ask' && turn.next.reason);
  return {
    state: turn.state,
    next: turn.next,
    ...(explain ? { message: formatTurnReply(turn.next, turn.notices) } : {}),
    ...(progress.basedOn ? { basedOn: progress.basedOn } : {}),
  };
}

const NO_ANSWER: InterviewUpdate = { filled: {}, stopFlags: [], turnFlags: [] };

/** 프로필 확인 화면의 "고치기" (B6). 그 항목만 비우고 다음 질문을 다시 계산한다. 다 답하면 다시 확인 화면(done) */
export function reopen(progress: FormProgress, section: ProfileSection): FormProgress {
  const next = advance({ ...progress, state: reopenSection(progress.state, section) }, NO_ANSWER);
  if (section.kind !== 'menus') return next;
  const previous = progress.state.draft.meals?.find((m) => sameMealKey(m, section.meal))?.menus ?? [];
  return previous.length > 0 ? { ...next, prefill: previous.join(', ') } : next;
}

/** 저장된 프로필로 시작 (B6 "바뀐 항목 고치기"): 끝난 진행이라 프로필 확인 화면부터 */
export function progressFromResult(result: InterviewResult): FormProgress {
  return advance({ ...startProgress(), state: { draft: draftFromResult(result), stopFlags: [], menuFollowUps: [] } }, NO_ANSWER);
}

/**
 * 저장된 진행과 서버 결과로 지금 진행을 정한다.
 * 서버가 새로 목표를 다시 물었으면 그 상태로, 아니면 저장된 진행으로, 둘 다 없으면 처음부터.
 */
export function resolveProgress(stored: string | null, serverAsk: ServerAsk | undefined): FormProgress {
  const saved = restoreProgress(stored);
  if (serverAsk && saved?.basedOn !== serverAsk.id) {
    const { state, next, message } = serverAsk.output;
    return { state: structuredClone(state), next: structuredClone(next), message, basedOn: serverAsk.id };
  }
  return saved ?? startProgress();
}

/** 저장 형식이 깨졌으면 undefined (처음부터 다시) */
export function restoreProgress(raw: string | null): FormProgress | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as FormProgress;
    const { state, next } = value;
    const ok =
      !!state &&
      typeof state.draft === 'object' &&
      state.draft !== null &&
      Array.isArray(state.stopFlags) &&
      Array.isArray(state.menuFollowUps) &&
      !!next &&
      ['ask', 'stop', 'done'].includes(next.kind);
    return ok ? value : undefined;
  } catch {
    return undefined;
  }
}
