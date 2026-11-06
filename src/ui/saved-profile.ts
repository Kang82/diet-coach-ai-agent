// 저장한 프로필 (tasks.md B6 T5-5). 서버 저장소(T6)와 사용자 토큰(T7-1)이 생기기 전까지 이 브라우저의 localStorage에 둔다.
// 프로필 확인 화면에서 저장에 동의한 끝난 인터뷰만 저장한다. 동의하지 않고 진행하면 지운다.
// 다른 기기에서는 불러오지 못한다. T6/T7에서 D1(토큰별)로 옮긴다.
import { profileFromInterview, type InterviewResult } from '../core/interview.ts';
import { validateProfile } from '../core/profile-validation.ts';

export const SAVED_PROFILE_KEY = 'diet-coach:profile';

export interface SavedProfile {
  /** consentedAt이 있는 끝난 인터뷰 */
  result: InterviewResult & { consentedAt: string };
}

/** 모양이 틀리거나 프로필 검증(동의 포함)을 통과하지 못하면 undefined */
export function parseSavedProfile(raw: string | null): SavedProfile | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as SavedProfile;
    const result = value?.result;
    if (!result || typeof result !== 'object' || !Array.isArray(result.goals) || !Array.isArray(result.meals)) return undefined;
    if (!Array.isArray(result.avoid) || typeof result.goalNote !== 'string' || typeof result.avoidNote !== 'string') return undefined;
    if (typeof result.consentedAt !== 'string') return undefined;
    if (validateProfile(profileFromInterview(result, new Date())).length > 0) return undefined;
    return { result };
  } catch {
    return undefined;
  }
}

export function loadSavedProfile(): SavedProfile | undefined {
  try {
    return parseSavedProfile(localStorage.getItem(SAVED_PROFILE_KEY));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 저장한 프로필이 없는 것으로 본다
    return undefined;
  }
}

/** 동의한 결과면 저장하고, 아니면 지운다 (가장 나중의 선택을 따른다) */
export function rememberResult(result: InterviewResult): void {
  try {
    if (result.consentedAt) {
      const saved: SavedProfile = { result: { ...result, consentedAt: result.consentedAt } };
      localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(saved));
    } else {
      localStorage.removeItem(SAVED_PROFILE_KEY);
    }
  } catch {
    // 위와 같음
  }
}

export function clearSavedProfile(): void {
  try {
    localStorage.removeItem(SAVED_PROFILE_KEY);
  } catch {
    // 위와 같음
  }
}
