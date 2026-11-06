// 서버 저장(T6-2)과 인터뷰 결과 사이의 변환. 순수 함수.
import { profileFromInterview, type InterviewResult } from './interview.ts';
import type { Profile } from './types.ts';

/** 대화 ID "<userId>-<무작위>"의 사용자 ID. 미들웨어가 접두어를 확인한다(core/guard.ts) */
export function userIdFromConversation(conversationId: string): string {
  const index = conversationId.indexOf('-');
  if (index <= 0) throw new Error(`사용자 ID가 없는 대화 ID입니다: ${conversationId}`);
  return conversationId.slice(0, index);
}

/** 저장할 프로필. 버전은 저장소가 정한다 */
export function profileForSave(result: InterviewResult, userId: string, now: Date): Profile {
  return { ...profileFromInterview(result, now), userId };
}

/** 저장한 프로필을 첫 화면 분기가 쓰는 인터뷰 결과 모양으로 (ui/saved-profile.ts) */
export function resultFromProfile(profile: Profile): InterviewResult & { consentedAt: string } {
  const { goals, goalNote, medication, avoid, avoidNote, meals, consentedAt } = structuredClone(profile);
  return { goals, goalNote, medication, avoid, avoidNote, meals, consentedAt };
}
