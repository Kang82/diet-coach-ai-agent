// 스펙 11.4 한도 보호의 순수 로직. 미들웨어는 src/server/guard.ts.
// 아래 값은 Workers AI 무료 티어(하루 10,000 Neuron)를 전제로 정했다. 요금제를 바꾸면 docs/plan-upgrade.md를 본다.
import { QUOTA_EXCEEDED_MESSAGE } from './quota.ts';

/** 사용자 하나가 하루에 보낼 수 있는 메시지(에이전트 POST) 수 (11.4-2) */
export const USER_DAILY_MESSAGE_LIMIT = 30;

/** Worker 전체 하루 Neuron 안전선 (11.4-3). 무료 한도 10,000의 80%. 넘으면 새 메시지를 모두 막는다 */
export const GLOBAL_DAILY_NEURON_LIMIT = 8_000;

/** 실패하거나 시간이 지나 사용량을 모르는 LLM 호출을 걸린 초당 이만큼으로 센다 (실측 1.5~1.9/초보다 크게) */
export const FAILED_CALL_NEURONS_PER_SECOND = 2;

export const USER_LIMIT_MESSAGE = '오늘 이용 횟수를 다 썼어요. 오전 9시 이후에 다시 할 수 있어요.';

export type GuardErrorType = 'unauthorized' | 'forbidden' | 'user_daily_limit' | 'global_daily_limit';

const MESSAGES: Record<GuardErrorType, string> = {
  unauthorized: '받은 링크로 들어와 주세요.',
  forbidden: '이 대화를 볼 수 없어요.',
  user_daily_limit: USER_LIMIT_MESSAGE,
  global_daily_limit: QUOTA_EXCEEDED_MESSAGE,
};

/** Flue 에러 봉투와 같은 모양 (`{ error: { type, message, details } }`). 화면은 type으로 가린다 */
export function errorBody(type: GuardErrorType) {
  return { error: { type, message: MESSAGES[type], details: '' } };
}

/** 토큰의 SHA-256 hex. 저장소에는 이 값만 둔다 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 카운터 날짜. Workers AI 한도처럼 00:00 UTC(한국 오전 9시)에 바뀐다 */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** 대화 ID는 "<userId>-<무작위>"다. 접두어가 정확히 맞고 뒤가 비지 않아야 그 사용자의 대화다 */
export function ownsConversation(userId: string, conversationId: string): boolean {
  const prefix = `${userId}-`;
  return conversationId.startsWith(prefix) && conversationId.length > prefix.length;
}

/** 대화 주소 뒤 경로(rest)를 보고 새 메시지 전송인지. abort와 읽기는 세지도 막지도 않는다 */
export function isMessagePost(method: string, rest: readonly string[]): boolean {
  return method === 'POST' && rest.length === 0;
}
