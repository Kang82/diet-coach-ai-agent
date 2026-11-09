// 저장한 프로필 (tasks.md B6 T5-5, B9 T6-2). 서버 D1에 사용자(토큰)별로 있다.
// 저장은 서버가 한다: 인터뷰 제출에서 동의했으면 저장하고, 동의하지 않았으면 지운다(storage/persist.ts).
// 화면은 GET /api/profile로 불러오고 DELETE /api/profile로 지운다. 다른 기기에서도 같은 링크면 불러온다.
// B8까지 쓰던 localStorage `diet-coach:profile`은 처음 열 때 지운다(clearLegacyProfile).
import { profileFromInterview, type InterviewResult } from '../core/interview.ts';
import { validateProfile } from '../core/profile-validation.ts';
import { defaultStore, PROFILE_KEY, type KeyValueStore } from './browser-store.ts';

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

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** 서버에 저장한 프로필. 없거나, 모양이 틀리거나, 불러오지 못하면 undefined(인터뷰를 처음부터) */
export async function fetchSavedProfile(token: string, fetchFn: FetchLike = fetch): Promise<SavedProfile | undefined> {
  try {
    const res = await fetchFn('/api/profile', { headers: auth(token) });
    if (!res.ok) return undefined;
    return parseSavedProfile(await res.text());
  } catch {
    return undefined;
  }
}

/** failed: 서버가 못 지운 대화 수 (T15) */
/** busy: 같은 사용자의 만들기·분류·칸 수정이 진행 중이라 서버가 지우지 않았다 (T22-4) */
export type DeleteResult = { ok: true; failed: number } | { ok: false; busy?: true };

/** 서버에 남은 내 기록(저장한 프로필·식단표, 이 링크로 남긴 대화)을 모두 지운다 (T15) */
export async function deleteMyRecords(token: string, fetchFn: FetchLike = fetch): Promise<DeleteResult> {
  try {
    const res = await fetchFn('/api/profile', { method: 'DELETE', headers: auth(token) });
    if (res.status === 409) return { ok: false, busy: true };
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { failed?: unknown };
    return typeof body?.failed === 'number' ? { ok: true, failed: body.failed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** B8까지 이 브라우저에 두던 프로필(건강 정보)을 지운다 */
export function clearLegacyProfile(store: KeyValueStore | undefined = defaultStore()): void {
  try {
    store?.removeItem(PROFILE_KEY);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}
