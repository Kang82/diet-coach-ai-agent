// 메시지 보내기 실패를 화면 안내로 바꾼다 (스펙 11.4, B8).
// SDK의 send는 다시 시도하지 않고 FlueApiError({ status, body })로 실패한다. 한도 보호 미들웨어는
// Flue 에러 봉투 모양 { error: { type, message } }로 답한다(core/guard.ts).
import { errorBody, type GuardErrorType } from '../core/guard.ts';

export interface SendFailure {
  kind: 'limit' | 'auth' | 'other';
  message: string;
}

const OTHER_MESSAGE = '보내지 못했어요. 잠시 뒤 다시 시도해 주세요.';

export function toSendFailure(error: unknown): SendFailure {
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
  const type = guardType(error);
  if (status === 429 && (type === 'user_daily_limit' || type === 'global_daily_limit')) {
    return { kind: 'limit', message: errorBody(type).error.message };
  }
  if (status === 401 || status === 403) {
    return { kind: 'auth', message: errorBody(status === 401 ? 'unauthorized' : 'forbidden').error.message };
  }
  return { kind: 'other', message: OTHER_MESSAGE };
}

function guardType(error: unknown): GuardErrorType | undefined {
  const body = typeof error === 'object' && error !== null ? (error as { body?: unknown }).body : undefined;
  const type = typeof body === 'object' && body !== null ? (body as { error?: { type?: unknown } }).error?.type : undefined;
  return typeof type === 'string' ? (type as GuardErrorType) : undefined;
}

// 보내기에 실패하면 각 화면의 상태 함수는 status === 'error'를 보고 일반 문구("잠시 뒤 다시")를 띄운다.
// 한도나 링크 문제는 다시 보내도 안 되므로 그 자리의 문구를 정확한 안내로 바꾼다. 그 밖의 실패는 화면 문구 그대로.
type WithAlert = { kind: string; alert?: string };
type PlanLike = { kind: string; message?: string; editNotice?: { tone: string; messages: string[]; changed: unknown[] } };

const specific = (failure: SendFailure | undefined) => (failure && failure.kind !== 'other' ? failure : undefined);

/** 인터뷰 확인 화면(form), 기간 선택(idle)의 alert */
export function withSendAlert<S extends WithAlert>(state: S, failure: SendFailure | undefined, kind: S['kind']): S {
  const f = specific(failure);
  return f && state.kind === kind ? { ...state, alert: f.message } : state;
}

/** 식단표 만들기 실패 화면의 문구, 칸 수정 실패 알림 */
export function withSendPlanFailure<S extends PlanLike>(state: S, failure: SendFailure | undefined): S {
  const f = specific(failure);
  if (!f) return state;
  if (state.kind === 'error') return { ...state, message: f.message };
  if (state.kind === 'done') return { ...state, editNotice: { tone: 'error', messages: [f.message], changed: [] } };
  return state;
}
