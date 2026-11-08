// 인터뷰 화면의 진행 상태 (스펙 4.1, tasks.md B4). 순수 함수.
// 인터뷰는 서버 왕복 없이 화면에서 단계마다 applyTurn을 돌린다. 진행 상태는 localStorage(대화 ID별)에 두어 새로고침해도 이어진다.
// 제출 뒤 서버가 목표를 다시 물으면(ask) 그 상태에서 이어 간다.
import { EMPTY_INTERVIEW } from '../core/interview-runner.ts';
import { formatTurnReply, type InterviewMessage } from '../core/interview-text.ts';
import { applyTurn, type TurnNext } from '../core/interview-turn.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import type { InterviewResult } from '../core/interview.ts';
import { draftKey } from './browser-store.ts';
import { carryMealDetails, draftFromResult, reopenSection, type ProfileSection } from '../core/profile-edit.ts';
import type { MealRow } from '../core/interview-form.ts';
import { sameMealKey } from '../core/helpers.ts';
import type { AvoidTag, GoalId, InterviewDraft, InterviewState, InterviewUpdate, MealKey, Medication } from '../core/types.ts';

export interface FormProgress {
  state: InterviewState;
  next: TurnNext;
  /** 지금 단계 위에 보여 줄 안내 (다시 묻는 이유, 중단 안내 등) */
  message?: InterviewMessage;
  /** 이어받은 서버 ask의 도구 호출 ID. 같은 ask를 두 번 이어받지 않으려고 둔다 */
  basedOn?: string;
  /**
   * 프로필 확인 화면의 "고치기" 직전 상태 (T16, B16의 메뉴 prefill을 넓힘). 다시 묻는 단계마다 이전 답을 채우고(stepDefaults),
   * 끼니를 다시 답하면 장소가 같은 끼니의 메뉴·조리 시간을 이어 붙인다. 다시 확인 화면(done)이 되면 없어진다
   */
  previous?: { draft: InterviewDraft; menuFollowUps: MealKey[] };
}

/** 지금 묻는 단계의 기본값 (이전 답). 고치기가 아니면 빈 값 */
export interface StepDefaults {
  goals?: GoalId[];
  goalNote?: string;
  medication?: Medication;
  avoid?: AvoidTag[];
  avoidNote?: string;
  meals?: MealRow[];
  menusText?: string;
  cookMinutes?: number | null;
}

export type ServerAsk = { id: string; output: Extract<InterviewToolOutput, { status: 'ask' }> };

export function progressKey(conversationId: string): string {
  return draftKey('interview', conversationId);
}

export function startProgress(): FormProgress {
  return { state: structuredClone(EMPTY_INTERVIEW), next: { kind: 'ask', field: 'goals' } };
}

export function advance(progress: FormProgress, update: InterviewUpdate): FormProgress {
  const { state, update: carried } = carryFromPrevious(progress, update);
  const turn = applyTurn(state, carried);
  const explain = turn.next.kind === 'stop' || turn.notices.length > 0 || (turn.next.kind === 'ask' && turn.next.reason);
  return {
    state: turn.state,
    next: turn.next,
    ...(explain ? { message: formatTurnReply(turn.next, turn.notices) } : {}),
    ...(progress.basedOn ? { basedOn: progress.basedOn } : {}),
    // 고치기 중(다음 단계가 ask)에만 이전 답을 넘긴다
    ...(progress.previous && turn.next.kind === 'ask' ? { previous: progress.previous } : {}),
  };
}

/** 고치기에서 끼니를 다시 답하면 장소가 같은 끼니의 메뉴·조리 시간과 "메뉴가 적어요" 추가 질문 기록을 이어 붙인다 (T16) */
function carryFromPrevious(progress: FormProgress, update: InterviewUpdate): { state: InterviewState; update: InterviewUpdate } {
  const answeringMeals = progress.next.kind === 'ask' && progress.next.field === 'meals';
  const meals = update.filled.meals;
  if (!progress.previous || !answeringMeals || !meals) return { state: progress.state, update };
  const carried = carryMealDetails(meals, progress.previous.draft.meals ?? []);
  const menuFollowUps = progress.previous.menuFollowUps.filter((k) =>
    carried.some((m) => sameMealKey(m, k) && m.place === 'eat_out' && m.menus?.length),
  );
  return {
    state: { ...progress.state, menuFollowUps },
    update: { ...update, filled: { ...update.filled, meals: carried } },
  };
}

/** 지금 묻는 단계의 이전 답 (T16). 화면의 단계 컴포넌트가 이 값으로 시작한다 */
export function stepDefaults(progress: FormProgress): StepDefaults {
  const draft = progress.previous?.draft;
  const next = progress.next;
  if (!draft || next.kind !== 'ask') return {};
  const field = next.field;
  const defined = <T extends object>(value: T): T =>
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
  if (field === 'goals') return defined({ goals: draft.goals && [...draft.goals], goalNote: draft.goalNote });
  if (field === 'medication') return defined({ medication: draft.medication });
  if (field === 'avoid') return defined({ avoid: draft.avoid && [...draft.avoid], avoidNote: draft.avoidNote });
  if (field === 'meals') {
    if (!draft.meals) return {};
    return {
      meals: draft.meals.flatMap(({ dayType, meal, place, companions }) =>
        place ? [{ dayType, meal, place, companions: companions ?? 'alone' }] : [],
      ),
    };
  }
  if ('menusFor' in field) {
    const menus = draft.meals?.find((m) => sameMealKey(m, field.menusFor))?.menus ?? [];
    return menus.length > 0 ? { menusText: menus.join(', ') } : {};
  }
  const cook = draft.meals?.find((m) => sameMealKey(m, field.cookMinutesFor))?.cookMinutes;
  return cook === undefined ? {} : { cookMinutes: cook };
}

const NO_ANSWER: InterviewUpdate = { filled: {}, stopFlags: [], turnFlags: [] };

/** 프로필 확인 화면의 "고치기" (B6). 그 항목만 비우고 다음 질문을 다시 계산한다. 다 답하면 다시 확인 화면(done) */
export function reopen(progress: FormProgress, section: ProfileSection): FormProgress {
  const previous = { draft: structuredClone(progress.state.draft), menuFollowUps: structuredClone(progress.state.menuFollowUps) };
  return advance({ ...progress, state: reopenSection(progress.state, section), previous }, NO_ANSWER);
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
