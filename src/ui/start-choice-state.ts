// 첫 화면 분기 판단 (스펙 7장, tasks.md B6 T5-5, 리뷰 5번). 순수 함수.
import type { InterviewViewState } from './interview-view-state.ts';

export interface StartChoiceInput {
  /** 이 브라우저에 저장한 프로필이 있음 */
  hasSaved: boolean;
  /** 이번 화면에서 이미 고름 (지난 프로필로 시작, 바뀐 항목 고치기, 인터뷰 처음부터) */
  decided: boolean;
  interview: InterviewViewState;
  /** 이 대화의 인터뷰 진행이 저장돼 있음 */
  hasProgress: boolean;
}

/** 새 대화(인터뷰를 시작하지 않음)이고 저장한 프로필이 있으면 고르게 한다 */
export function shouldOfferSaved({ hasSaved, decided, interview, hasProgress }: StartChoiceInput): boolean {
  return hasSaved && !decided && interview.kind === 'form' && !interview.serverAsk && !interview.alert && !hasProgress;
}

export type StartChoice = 'use_saved' | 'edit_saved' | 'fresh';

/**
 * 프로필 확인 화면의 저장 동의 기본값. "바뀐 항목 고치기"를 고른 직후에만 체크한다.
 * "인터뷰 처음부터"나 새 사용자는 명시적으로 다시 받는다 (리뷰 5번)
 */
export function defaultConsentFor(choice: StartChoice | undefined): boolean {
  return choice === 'edit_saved';
}
