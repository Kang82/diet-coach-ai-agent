// 인터뷰 화면 입력 → InterviewUpdate (스펙 4.1, tasks.md B4).
// 정해진 답은 화면이 받고 코드가 update를 만든다. 화면은 단계마다 applyTurn을 돌려 다음 단계를 정하고,
// 끝나면 초안 전체를 제출 메시지 한 번으로 보낸다. LLM은 목표 메모 확인에만 쓴다 (interview-note.ts).
import { menuKey, sameMealKey } from './helpers.ts';
import { GOAL_IDS } from './types.ts';
import type {
  AvoidTag,
  DraftMealSetting,
  GoalId,
  InterviewDraft,
  InterviewUpdate,
  MealKey,
  MealSetting,
  Medication,
  StopFlag,
} from './types.ts';

const update = (filled: InterviewDraft, stopFlags: StopFlag[] = []): InterviewUpdate => ({
  filled,
  stopFlags,
  turnFlags: [],
});

export interface GoalsInput {
  goals: GoalId[];
  goalNote: string;
  /** 목표 단계의 "해당하면 골라 주세요" (임신, 신장 질환) */
  stopFlags: StopFlag[];
}

export function goalsUpdate({ goals, goalNote, stopFlags }: GoalsInput): InterviewUpdate {
  const sorted = GOAL_IDS.filter((g) => goals.includes(g));
  return update({ goals: sorted, goalNote: goalNote.trim() }, [...stopFlags]);
}

export function medicationUpdate(medication: Medication): InterviewUpdate {
  return update({ medication });
}

export function avoidUpdate({ avoid, avoidNote }: { avoid: AvoidTag[]; avoidNote: string }): InterviewUpdate {
  return update({ avoid: [...avoid], avoidNote: avoidNote.trim() });
}

export type MealRow = Pick<MealSetting, 'dayType' | 'meal' | 'place' | 'companions'>;

/** 안 먹는 끼니는 같이 먹는 사람을 넣지 않는다 */
export function mealsUpdate(rows: readonly MealRow[]): InterviewUpdate {
  return update({
    meals: rows.map(({ dayType, meal, place, companions }) =>
      place === 'skip' ? { dayType, meal, place } : { dayType, meal, place, companions },
    ),
  });
}

/**
 * 끼니 하나의 외식 메뉴 최대 개수. 메뉴 목록은 분류·식단 프롬프트에 들어가 입력 토큰이 된다 (배포 전 보안 리뷰, 2026-11-07).
 * 서버 스키마(agents/interview-schema.ts)도 같은 값으로 막는다
 */
export const MAX_MENUS_PER_MEAL = 20;

/** 쉼표·줄바꿈·가운뎃점으로 나눈다. 공백만 다른 메뉴(menuKey가 같은 메뉴)는 처음 것만 남긴다. 앞의 MAX_MENUS_PER_MEAL개까지 */
export function parseMenus(text: string): string[] {
  const menus: string[] = [];
  for (const raw of text.split(/[,\n·、]/)) {
    const menu = raw.trim().replace(/\s+/g, ' ');
    if (menu && !menus.some((m) => menuKey(m) === menuKey(menu))) menus.push(menu);
  }
  return menus.slice(0, MAX_MENUS_PER_MEAL);
}

/** existing: 이미 받은 메뉴. 한 번 더 물었을 때(분기 6) 합친다 */
export function menusUpdate(key: MealKey, text: string, existing: readonly string[] = []): InterviewUpdate {
  const menus = parseMenus([...existing, text].join(','));
  return update({ meals: [{ dayType: key.dayType, meal: key.meal, menus }] });
}

/** null은 "상관없다" */
export function cookMinutesUpdate(key: MealKey, minutes: number | null): InterviewUpdate {
  return update({ meals: [{ dayType: key.dayType, meal: key.meal, cookMinutes: minutes }] });
}

export function draftMeal(draft: InterviewDraft, key: MealKey): DraftMealSetting | undefined {
  return draft.meals?.find((m) => sameMealKey(m, key));
}

// 제출 메시지. submit_interview 도구가 useDelivery()로 직접 읽는다 (edit-request.ts와 같은 방식)

export const INTERVIEW_SUBMIT_PREFIX = '인터뷰 제출:';

export interface InterviewSubmission {
  draft: InterviewDraft;
  stopFlags: StopFlag[];
  /** 프로필 확인 화면의 저장 동의 (tasks.md B6). 없으면 동의하지 않음 */
  consent?: boolean;
  /** 프로필 확인 화면에서 "고치기"로 다시 연 항목 수 (T26, 측정 기록). 없으면 남기지 않는다 */
  profileEdits?: number;
}

export function formatInterviewSubmission(submission: InterviewSubmission): string {
  return `${INTERVIEW_SUBMIT_PREFIX}\n${JSON.stringify(submission)}`;
}

export function isInterviewSubmission(body: string): boolean {
  return body.trimStart().startsWith(INTERVIEW_SUBMIT_PREFIX);
}

/** 제출 메시지의 JSON. 모양 검사는 하지 않는다(agents의 valibot 스키마가 한다). 형식이 아니면 undefined */
export function submissionJson(body: string): unknown {
  if (!isInterviewSubmission(body)) return undefined;
  try {
    return JSON.parse(body.trimStart().slice(INTERVIEW_SUBMIT_PREFIX.length));
  } catch {
    return undefined;
  }
}
