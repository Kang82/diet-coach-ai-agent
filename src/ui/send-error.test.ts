import { describe, expect, it } from 'vitest';
import { errorBody, kindLimitMessage, USER_LIMIT_MESSAGE } from '../core/guard.ts';
import { QUOTA_EXCEEDED_MESSAGE } from '../core/quota.ts';
import { toSendFailure, withSendAlert, withSendPlanFailure } from './send-error.ts';

const apiError = (status: number, body: unknown) => Object.assign(new Error('Flue API error'), { status, body });

describe('toSendFailure', () => {
  it('사용자 하루 제한과 전체 안전선은 한도 안내', () => {
    expect(toSendFailure(apiError(429, errorBody('user_daily_limit')))).toEqual({
      kind: 'limit',
      message: USER_LIMIT_MESSAGE,
    });
    expect(toSendFailure(apiError(429, errorBody('global_daily_limit')))).toEqual({
      kind: 'limit',
      message: QUOTA_EXCEEDED_MESSAGE,
    });
  });

  it('종류별 하루 제한(T10-3)은 서버가 보낸 종류 문구 그대로 한도 안내', () => {
    expect(toSendFailure(apiError(429, errorBody('user_kind_limit', 'plan')))).toEqual({
      kind: 'limit',
      message: kindLimitMessage('plan'),
    });
    // 문구가 없으면 일반 한도 문구
    expect(toSendFailure(apiError(429, { error: { type: 'user_kind_limit' } }))).toEqual({
      kind: 'limit',
      message: errorBody('user_kind_limit').error.message,
    });
  });

  it('앞 요청이 진행 중(busy, T19-7)이면 서버 문구로 안내', () => {
    expect(toSendFailure(apiError(429, errorBody('busy')))).toEqual({ kind: 'limit', message: errorBody('busy').error.message });
  });

  it('401, 403은 링크 안내', () => {
    expect(toSendFailure(apiError(401, errorBody('unauthorized'))).kind).toBe('auth');
    expect(toSendFailure(apiError(403, '')).kind).toBe('auth');
  });

  it('가드가 본문을 거절하면(413, 400 message_rejected) 그 안내', () => {
    expect(toSendFailure(apiError(413, errorBody('message_rejected')))).toEqual({
      kind: 'rejected',
      message: errorBody('message_rejected').error.message,
    });
    expect(toSendFailure(apiError(400, errorBody('message_rejected'))).kind).toBe('rejected');
    expect(toSendFailure(apiError(400, { error: { type: 'invalid_request' } })).kind).toBe('other');
  });

  it('그 밖의 실패(모양이 다른 429, 네트워크)는 다시 시도 안내', () => {
    expect(toSendFailure(apiError(429, 'Too Many Requests')).kind).toBe('other');
    expect(toSendFailure(new TypeError('Failed to fetch')).kind).toBe('other');
  });
});

describe('화면 문구 바꾸기', () => {
  const limit = { kind: 'limit', message: USER_LIMIT_MESSAGE } as const;
  const other = { kind: 'other', message: '보내지 못했어요.' } as const;

  it('한도면 인터뷰·기간 선택의 일반 안내를 한도 안내로 바꾼다', () => {
    expect(withSendAlert({ kind: 'form', alert: '일반' }, limit, 'form')).toEqual({ kind: 'form', alert: USER_LIMIT_MESSAGE });
    expect(withSendAlert({ kind: 'idle' as string }, limit, 'idle')).toEqual({ kind: 'idle', alert: USER_LIMIT_MESSAGE });
  });

  it('다른 단계이거나 그 밖의 실패면 그대로', () => {
    expect(withSendAlert({ kind: 'submitting' as string }, limit, 'form')).toEqual({ kind: 'submitting' });
    expect(withSendAlert({ kind: 'form', alert: '일반' }, other, 'form')).toEqual({ kind: 'form', alert: '일반' });
    expect(withSendAlert({ kind: 'form', alert: '일반' }, undefined, 'form')).toEqual({ kind: 'form', alert: '일반' });
  });

  it('식단표 만들기 실패 문구와 칸 수정 알림을 한도 안내로 바꾼다', () => {
    expect(withSendPlanFailure({ kind: 'error', message: '일반', retry: 'x' }, limit)).toEqual({
      kind: 'error',
      message: USER_LIMIT_MESSAGE,
      retry: 'x',
    });
    expect(withSendPlanFailure({ kind: 'done' }, limit)).toEqual({
      kind: 'done',
      editNotice: { tone: 'error', messages: [USER_LIMIT_MESSAGE], changed: [] },
    });
    expect(withSendPlanFailure({ kind: 'creating' }, limit)).toEqual({ kind: 'creating' });
    expect(withSendPlanFailure({ kind: 'error', message: '일반' }, other)).toEqual({ kind: 'error', message: '일반' });
  });
});
