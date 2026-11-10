// 들어오기 화면 상태 (AccessGate.tsx, 스펙 11.4-1, T24). 화면 상태 판단은 순수 함수로 두고 테스트한다.
// checking: 저장한 토큰을 /api/me로 확인하는 중 / invite: 초대 코드 입력 / failed: 연결 실패(다시 시도)
// welcome: 코드로 토큰을 막 받음, 개인 링크 안내 / ok: App
export type Access =
  | { kind: 'checking' }
  | { kind: 'invite' }
  | { kind: 'failed' }
  | { kind: 'welcome'; userId: string; saved: boolean }
  | { kind: 'ok'; userId: string };

/** 토큰이 있으면 확인부터, 없으면 초대 코드 */
export function initialAccess(token: string | undefined): Access {
  return token ? { kind: 'checking' } : { kind: 'invite' };
}

/** /api/me를 불러야 하는지. 코드로 막 받은 토큰(welcome)은 서버가 방금 준 값이라 다시 확인하지 않는다 */
export function needsCheck(access: Access, token: string | undefined): boolean {
  return token !== undefined && access.kind === 'checking';
}

export type MeOutcome = { status: number; userId?: unknown } | 'network_error';

/** /api/me 결과. 모르는 토큰(401)이면 초대 코드로 새로 받는다 */
export function accessFromMe(outcome: MeOutcome): Access {
  if (outcome === 'network_error') return { kind: 'failed' };
  if (outcome.status === 401) return { kind: 'invite' };
  if (outcome.status >= 200 && outcome.status < 300 && typeof outcome.userId === 'string') {
    return { kind: 'ok', userId: outcome.userId };
  }
  return { kind: 'failed' };
}

/** 코드로 토큰을 받은 뒤. saved=false면(사생활 보호 창 등) 새로고침하면 토큰을 잃는다고 알린다 */
export function accessAfterRegister(userId: string, saved: boolean): Access {
  return { kind: 'welcome', userId, saved };
}

/** 개인 링크 안내에서 "시작하기" */
export function accessAfterWelcome(access: Access): Access {
  return access.kind === 'welcome' ? { kind: 'ok', userId: access.userId } : access;
}
