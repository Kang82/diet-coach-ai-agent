// 도구가 끝난 뒤 서버 저장 규칙 (T6-2, 스펙 5장). 동의한 사용자만 D1에 남긴다.
// - 인터뷰: 동의하면 프로필 저장(버전 +1), 동의하지 않으면 그 사용자의 프로필과 식단표를 지운다.
// - 식단표: 동의한 프로필이 있을 때만 저장한다(새 행). userId와 profileVersion은 저장된 프로필 기준.
// 저장 실패는 던진다. 도구는 잡아서 경고만 남기고 결과는 그대로 돌려준다(식단표는 대화에 남아 있다).
import type { InterviewResult } from '../core/interview.ts';
import { profileForSave } from '../core/profile-store.ts';
import type { Plan } from '../core/types.ts';
import type { Storage } from './storage.ts';

export async function persistInterview(storage: Storage, userId: string, result: InterviewResult, now: Date) {
  if (result.consentedAt) await storage.saveProfile(profileForSave(result, userId, now));
  else await storage.deleteUser(userId);
}

/** 저장했으면 true */
export async function persistPlan(storage: Storage, userId: string, plan: Plan): Promise<boolean> {
  const profile = await storage.getProfile(userId);
  if (!profile?.consentedAt) return false;
  await storage.savePlan({ ...plan, userId, profileVersion: profile.version });
  return true;
}
