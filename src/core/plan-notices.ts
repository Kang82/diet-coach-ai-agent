// 스펙 7장. 식단표 아래에 붙이는 안내 문구. 문구는 LLM이 아니라 코드가 정한다.
import type { Profile } from './types.ts';

export const MEDICAL_DISCLAIMER = '일반적인 식단 지침을 따른 추천이며, 의료 조언이 아닙니다.';
export const MEDICATION_ADVICE = '복용 중인 약이 있으니 식단을 바꾸기 전에 의사나 약사와 상담하세요.';

export function buildPlanNotices(profile: Pick<Profile, 'medication'>): string[] {
  return profile.medication === 'none' ? [MEDICAL_DISCLAIMER] : [MEDICAL_DISCLAIMER, MEDICATION_ADVICE];
}
