// 스펙 7장. 식단표 아래에 붙이는 안내 문구. 문구는 LLM이 아니라 코드가 정한다.
import { MENU_WEEKLY_MAX } from './plan-slots.ts';
import type { Profile } from './types.ts';

export const MEDICAL_DISCLAIMER = '일반적인 식단 지침을 따른 추천이며, 의료 조언이 아닙니다.';
export const MEDICATION_ADVICE = '복용 중인 약이 있으니 식단을 바꾸기 전에 의사나 약사와 상담하세요.';

/** 기간 화면에서 고른 시작일과 실제로 만든 시작일 (tasks.md T10-5) */
export interface WeekShift {
  /** 분류할 때 저장한 시작일(PlanPeriod.weekStart). 없으면 안내하지 않는다 */
  chosen: string | undefined;
  /** 식단표의 시작일(planWeekStart 결과) */
  weekStart: string;
  hasEvents: boolean;
}

/**
 * menuWeeklyMax: 사전 점검이 정한 같은 메뉴 허용 횟수 (B15, plan-feasibility.ts). 기본(2)보다 크면 알린다
 */
export function buildPlanNotices(profile: Pick<Profile, 'medication'>, shift?: WeekShift, menuWeeklyMax = MENU_WEEKLY_MAX): string[] {
  const notices = profile.medication === 'none' ? [MEDICAL_DISCLAIMER] : [MEDICAL_DISCLAIMER, MEDICATION_ADVICE];
  const head: string[] = [];
  if (shift?.chosen && shift.chosen !== shift.weekStart) head.push(weekShiftNotice(shift));
  if (menuWeeklyMax > MENU_WEEKLY_MAX) head.push(`외식 메뉴가 적어 같은 메뉴를 1주일에 ${menuWeeklyMax}번까지 넣었어요.`);
  return [...head, ...notices];
}

/** 기간을 고른 뒤 그 주가 시작돼 다음 주로 만든 경우. 일정은 요일 기준이라 같은 요일·끼니로 옮겨 붙는다 (period.ts planWeekStart) */
function weekShiftNotice({ chosen, weekStart, hasEvents }: WeekShift): string {
  const line = `고른 주(${monthDay(chosen!)}~)가 이미 시작돼 다음 주(${monthDay(weekStart)}~)로 만들었어요.`;
  return hasEvents ? `${line} 일정은 같은 요일·끼니에 넣었어요.` : line;
}

/** 'YYYY-MM-DD' → 'M/D' (화면 식단표 머리글과 같은 표기, ui/plan-layout.ts) */
function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}
