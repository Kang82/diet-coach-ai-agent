// 스펙 4.1 턴마다 코드가 하는 분기 1~7. LLM이 낸 InterviewUpdate를 받아 다음 상태와 다음 할 일을 정한다.
// 문구는 만들지 않고 code만 돌려준다(checkPlan이 stats만 돌려주는 것과 같다). 문구는 인터뷰 턴(T4-4)에서 정한다.
import { buildCriteria } from './criteria.ts';
import { sameMealKey, toMealKey } from './helpers.ts';
import { finishDraft, mergeDraft, menuCount, nextField, type InterviewResult } from './interview.ts';
import { GOAL_LABELS } from './labels.ts';
import { GOAL_IDS, STOP_FLAGS } from './types.ts';
import type {
  CriteriaRules,
  InterviewDraft,
  InterviewField,
  InterviewState,
  InterviewUpdate,
  MealKey,
  StopFlag,
  TurnFlag,
} from './types.ts';

export type AskReason = 'extreme_restriction' | 'unsupported_goal' | 'ambiguous' | 'few_menus';

/** 다룰 수 없다고 답하고 인터뷰는 이어 가는 질문 (분기 4) */
export type OutOfScopeNotice = Extract<TurnFlag, 'asks_lab_interpretation' | 'asks_medication_advice'>;
const OUT_OF_SCOPE: readonly OutOfScopeNotice[] = ['asks_lab_interpretation', 'asks_medication_advice'];

export type TurnNext =
  | { kind: 'stop'; flags: StopFlag[] }
  | { kind: 'ask'; field: InterviewField; reason?: AskReason; choices?: string[] }
  | { kind: 'done'; result: InterviewResult; criteria: CriteriaRules };

export interface TurnResult {
  state: InterviewState;
  next: TurnNext;
  notices: OutOfScopeNotice[];
}

/** 미지원 목표일 때 보여 줄 선택지 (분기 3). 코드가 정한다 */
export const SUPPORTED_GOAL_CHOICES: string[] = GOAL_IDS.map((g) => GOAL_LABELS[g]);

/** 외식 메뉴가 이 개수 이하면 한 번 더 받아 본다 (분기 6) */
const FEW_MENUS = 2;

export function applyTurn(state: InterviewState, update: InterviewUpdate): TurnResult {
  const current = nextField(state.draft);
  const notices = OUT_OF_SCOPE.filter((flag) => update.turnFlags.includes(flag));
  const turn = (draft: InterviewDraft, next: TurnNext, menuFollowUps = state.menuFollowUps): TurnResult => ({
    state: { draft, stopFlags, menuFollowUps: structuredClone(menuFollowUps) },
    next,
    notices,
  });

  // 1. 중단 플래그. 한 번 생기면 남는다. 당뇨약 복용도 같게 본다
  const raised = new Set<StopFlag>([...state.stopFlags, ...update.stopFlags]);
  if (update.filled.medication === 'glucose' || state.draft.medication === 'glucose') raised.add('glucose_medication');
  const stopFlags = STOP_FLAGS.filter((f) => raised.has(f));
  if (stopFlags.length > 0) {
    return turn(mergeDraft(state.draft, update.filled), { kind: 'stop', flags: stopFlags });
  }

  // 2. 극단적 목표: 이번 답은 따르지 않고 같은 필드를 다시 묻는다
  if (update.turnFlags.includes('extreme_restriction')) {
    return turn(structuredClone(state.draft), ask(current ?? 'goals', 'extreme_restriction', update.ambiguous?.choices));
  }

  // 3. 미지원 목표: 지원하는 목표 중에서 고르게 한다
  if (update.turnFlags.includes('unsupported_goal')) {
    const { goals: _goals, ...rest } = update.filled;
    return turn(mergeDraft(state.draft, rest), ask('goals', 'unsupported_goal', SUPPORTED_GOAL_CHOICES));
  }

  // 5. 모호한 답: 그 필드만 빼고 반영하고, 선택지와 함께 다시 묻는다
  if (update.ambiguous) {
    const { field, choices } = update.ambiguous;
    return turn(mergeDraft(state.draft, without(update.filled, field)), ask(field, 'ambiguous', choices));
  }

  const draft = mergeDraft(state.draft, update.filled);

  // 6. 외식 메뉴가 2개 이하면 한 번 더 받아 본다. 이미 한 번 물었으면 그대로 진행한다
  const few = (update.filled.meals ?? [])
    .filter((m) => m.menus !== undefined)
    .map((m) => draft.meals!.find((d) => sameMealKey(d, m))!)
    .find(
      (m) =>
        m.place === 'eat_out' &&
        menuCount(m) > 0 &&
        menuCount(m) <= FEW_MENUS &&
        !state.menuFollowUps.some((k) => sameMealKey(k, m)),
    );
  if (few) {
    const key = toMealKey(few);
    return turn(draft, ask({ menusFor: key }, 'few_menus'), [...state.menuFollowUps, key]);
  }

  // 7. 인터뷰 끝
  const next = nextField(draft);
  if (next === null) {
    const result = finishDraft(draft);
    return turn(draft, { kind: 'done', result, criteria: buildCriteria(result.goals) });
  }
  return turn(draft, { kind: 'ask', field: next });
}

function ask(field: InterviewField, reason: AskReason, choices?: string[]): TurnNext {
  return { kind: 'ask', field, reason, ...(choices?.length ? { choices: [...choices] } : {}) };
}

/** 모호한 필드의 값을 뺀 filled */
function without(filled: InterviewDraft, field: InterviewField): InterviewDraft {
  const copy = structuredClone(filled);
  if (typeof field === 'string') {
    delete copy[field];
    return copy;
  }
  const key: MealKey = 'menusFor' in field ? field.menusFor : field.cookMinutesFor;
  const prop = 'menusFor' in field ? 'menus' : 'cookMinutes';
  for (const m of copy.meals ?? []) if (sameMealKey(m, key)) delete m[prop];
  return copy;
}
