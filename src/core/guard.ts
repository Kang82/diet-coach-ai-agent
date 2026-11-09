// 스펙 11.4 한도 보호의 순수 로직. 미들웨어는 src/server/guard.ts.
// 아래 값은 Workers AI 무료 티어(하루 10,000 Neuron)를 전제로 정했다. 요금제를 바꾸면 docs/plan-upgrade.md를 본다.
import { LLM_TIME_LIMITS, PLAN_TOOL_BUDGETS, SUBMISSION_DURABILITY } from './llm-timeout.ts';
import { messageKind, type ExpensiveKind, type MessageKind } from './message-kind.ts';
import { QUOTA_EXCEEDED_MESSAGE } from './quota.ts';

/** 사용자 하나가 하루에 보낼 수 있는 메시지(에이전트 POST) 수 (11.4-2) */
export const USER_DAILY_MESSAGE_LIMIT = 30;

/**
 * Worker 전체 Neuron 안전선 (11.4-3). 무료 한도 10,000의 80%. 넘으면 새 메시지를 모두 막는다.
 * 최근 24시간 합계(neuronWindowStart부터)와 비교한다 (tasks.md T7-5)
 */
export const GLOBAL_DAILY_NEURON_LIMIT = 8_000;

/** 실패하거나 시간이 지나 사용량을 모르는 LLM 호출을 걸린 초당 이만큼으로 센다 (실측 1.5~1.9/초보다 크게) */
export const FAILED_CALL_NEURONS_PER_SECOND = 2;

export const USER_LIMIT_MESSAGE = '오늘 이용 횟수를 다 썼어요. 오전 9시 이후에 다시 할 수 있어요.';

/**
 * 사용자 하나가 하루(UTC 날짜)에 보낼 수 있는 비싼 메시지 수 (tasks.md T10-3, 사용자 결정 2026-11-08).
 * 30회만으로는 만들기 27번(약 6,750~8,100 Neuron)으로 혼자 안전선에 닿는다. 보통 하루 약 3,500 Neuron 안쪽
 */
export const USER_DAILY_KIND_LIMITS: Record<ExpensiveKind, number> = { classify: 5, plan: 5, edit: 15 };

const KIND_LABELS: Record<ExpensiveKind, string> = { classify: '메뉴 분류', plan: '식단표 만들기', edit: '칸 다시 추천' };

export function kindLimitMessage(kind: ExpensiveKind): string {
  return `오늘 ${KIND_LABELS[kind]}는 ${USER_DAILY_KIND_LIMITS[kind]}번까지예요. 오전 9시 이후에 다시 할 수 있어요.`;
}

/**
 * 비싼 메시지가 진행 중일 때 안전선에 미리 더해 두는 양 (tasks.md T10-4). 사용량을 모를 때처럼 최악을 잡는다:
 * 도구 시간 예산(분류는 호출 상한) × FAILED_CALL_NEURONS_PER_SECOND. 만들기 1,200, 칸 수정 600, 분류 360
 */
export const RESERVE_NEURONS: Record<ExpensiveKind, number> = {
  classify: (LLM_TIME_LIMITS.menuClass / 1000) * FAILED_CALL_NEURONS_PER_SECOND,
  plan: (PLAN_TOOL_BUDGETS.createPlan / 1000) * FAILED_CALL_NEURONS_PER_SECOND,
  edit: (PLAN_TOOL_BUDGETS.editPlanCells / 1000) * FAILED_CALL_NEURONS_PER_SECOND,
};

/** 예약이 저절로 풀리는 시간. 제출 복구 한도(20분)와 같게 두어 복구가 길어져도 먼저 사라지지 않게 한다 */
export const RESERVATION_TTL_MS = SUBMISSION_DURABILITY.timeoutMs;

export type GuardErrorType =
  | 'unauthorized'
  | 'forbidden'
  | 'user_daily_limit'
  | 'user_kind_limit'
  | 'global_daily_limit'
  | 'message_rejected'
  | 'busy';

const MESSAGES: Record<GuardErrorType, string> = {
  message_rejected: '보낼 수 없는 메시지예요. 너무 길거나 첨부가 있어요.',
  unauthorized: '받은 링크로 들어와 주세요.',
  forbidden: '이 대화를 볼 수 없어요.',
  user_daily_limit: USER_LIMIT_MESSAGE,
  user_kind_limit: USER_LIMIT_MESSAGE,
  global_daily_limit: QUOTA_EXCEEDED_MESSAGE,
  // 사용자당 비싼 요청은 하나씩 (T19-7). 다른 대화나 탭에서 만들기·분류·칸 수정이 아직 도는 중
  busy: '앞 요청이 아직 진행 중이에요. 끝난 뒤 다시 시도해 주세요.',
};

/**
 * Flue 에러 봉투와 같은 모양 (`{ error: { type, message, details } }`). 화면은 type으로 가리고,
 * user_kind_limit은 종류마다 문구가 달라 message를 그대로 보여 준다
 */
export function errorBody(type: GuardErrorType, kind?: ExpensiveKind) {
  const message = type === 'user_kind_limit' && kind ? kindLimitMessage(kind) : MESSAGES[type];
  return { error: { type, message, details: '' } };
}

/** 토큰의 SHA-256 hex. 저장소에는 이 값만 둔다 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 사용자 메시지 수 카운터의 날짜. 00:00 UTC(한국 오전 9시)에 바뀐다 */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Neuron 카운터의 시간 칸 (UTC 'YYYY-MM-DDTHH'). 글자 순서가 시간 순서다 */
export function utcHour(now: Date): string {
  return now.toISOString().slice(0, 13);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 안전선이 합산하는 첫 시간 칸 (tasks.md T7-5). Workers AI 한도가 최근 24시간 합계처럼 동작해서 날짜가 아니라 창으로 센다.
 * 24시간 전 시각이 속한 칸부터 지금 칸까지 25칸(24~25시간)을 더한다. 시간 단위로 자른 오차는 더 막는 쪽으로 둔다
 */
export function neuronWindowStart(now: Date): string {
  return utcHour(new Date(now.getTime() - DAY_MS));
}

/** 접두어 뒤 형식. 화면 UUID(ui/conversation-id.ts)와 평가의 eval-<uuid>가 들어간다 (T22-6) */
const CONVERSATION_SUFFIX = /^[A-Za-z0-9-]{1,80}$/;

/** 대화 ID는 "<userId>-<무작위>"다. 접두어가 정확히 맞고 뒤가 정해진 형식이어야 그 사용자의 대화다 */
export function ownsConversation(userId: string, conversationId: string): boolean {
  const prefix = `${userId}-`;
  return conversationId.startsWith(prefix) && CONVERSATION_SUFFIX.test(conversationId.slice(prefix.length));
}

/**
 * 메시지 POST 본문 상한 (UTF-8 바이트). 화면이 보내는 가장 긴 메시지(인터뷰 제출: 메모 500자 2개, 외식 메뉴 입력 500자 × 끼니)도
 * 15KB 안쪽이라 넉넉히 둔다. 본문은 바깥 모델 맥락에 그대로 들어가 입력 토큰이 된다 (배포 전 보안 리뷰, 2026-11-07)
 */
export const MESSAGE_BODY_MAX_BYTES = 32 * 1024;

export type MessageBodyCheck = 'ok' | 'too_large' | 'unsupported';

/**
 * 메시지 POST 본문 검사. 화면은 `{ kind: 'user', body }`만 보낸다.
 * 첨부(이미지·PDF), signal, initialData는 쓰지 않으므로 받지 않는다. JSON이 아니거나 모양이 틀린 본문은 Flue가 400으로 거절한다
 */
export function checkMessageBody(raw: string): MessageBodyCheck {
  if (new TextEncoder().encode(raw).length > MESSAGE_BODY_MAX_BYTES) return 'too_large';
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return 'ok';
  }
  if (typeof json !== 'object' || json === null) return 'ok';
  const { kind, attachments, initialData } = json as Record<string, unknown>;
  if (kind === 'signal' || initialData !== undefined) return 'unsupported';
  if (attachments !== undefined && !(Array.isArray(attachments) && attachments.length === 0)) return 'unsupported';
  return 'ok';
}

/** 메시지 POST 본문(`{ kind: 'user', body }`)의 종류. JSON이 아니거나 body가 문자열이 아니면 chat (Flue가 거절한다) */
export function messageKindOfRaw(raw: string): MessageKind {
  try {
    const body = (JSON.parse(raw) as { body?: unknown } | null)?.body;
    return typeof body === 'string' ? messageKind(body) : 'chat';
  } catch {
    return 'chat';
  }
}

/** 대화 주소 뒤 경로(rest)를 보고 새 메시지 전송인지. abort와 읽기는 세지도 막지도 않는다 */
export function isMessagePost(method: string, rest: readonly string[]): boolean {
  return method === 'POST' && rest.length === 0;
}
