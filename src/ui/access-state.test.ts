import { describe, expect, it } from 'vitest';
import { accessAfterRegister, accessAfterWelcome, accessFromMe, initialAccess, needsCheck } from './access-state.ts';

describe('들어오기 화면 상태 (T24)', () => {
  it('토큰이 있으면 확인부터, 없으면 초대 코드', () => {
    expect(initialAccess('tok')).toEqual({ kind: 'checking' });
    expect(initialAccess(undefined)).toEqual({ kind: 'invite' });
  });

  it('확인 중일 때만 /api/me를 부른다 (막 받은 토큰은 다시 확인하지 않는다)', () => {
    expect(needsCheck({ kind: 'checking' }, 'tok')).toBe(true);
    expect(needsCheck({ kind: 'checking' }, undefined)).toBe(false);
    expect(needsCheck(accessAfterRegister('u', true), 'tok')).toBe(false);
    expect(needsCheck({ kind: 'ok', userId: 'u' }, 'tok')).toBe(false);
    expect(needsCheck({ kind: 'invite' }, 'tok')).toBe(false);
  });

  it('/api/me 결과: 200은 App, 401은 초대 코드(저장한 토큰이 틀림), 그 밖과 네트워크 실패는 다시 시도', () => {
    expect(accessFromMe({ status: 200, userId: 'u' })).toEqual({ kind: 'ok', userId: 'u' });
    expect(accessFromMe({ status: 401 })).toEqual({ kind: 'invite' });
    expect(accessFromMe({ status: 500 })).toEqual({ kind: 'failed' });
    expect(accessFromMe({ status: 200, userId: 1 })).toEqual({ kind: 'failed' });
    expect(accessFromMe('network_error')).toEqual({ kind: 'failed' });
  });

  it('코드로 받으면 링크 안내를 거쳐 App, 저장 여부를 함께 든다', () => {
    const welcome = accessAfterRegister('u', false);
    expect(welcome).toEqual({ kind: 'welcome', userId: 'u', saved: false });
    expect(accessAfterWelcome(welcome)).toEqual({ kind: 'ok', userId: 'u' });
    expect(accessAfterWelcome({ kind: 'invite' })).toEqual({ kind: 'invite' });
  });
});
