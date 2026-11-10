// 사용자 링크 토큰 확인 (스펙 11.4-1, B8). 토큰으로 /api/me를 불러 사용자 ID를 받은 뒤 App을 보여 준다.
// 토큰이 없거나 서버가 모르는 토큰이면 초대 코드를 받는다(T24). `/?invite=<코드>`로 들어오면 코드를 주소에서 지우고 바로 보낸다.
// 코드로 토큰을 받으면 저장하고, 다른 기기에서 열 개인 링크를 한 번 보여 준 뒤 App으로 간다. 상태 판단은 access-state.ts
import { useEffect, useState } from 'react';
import {
  accessAfterRegister,
  accessAfterWelcome,
  accessFromMe,
  initialAccess,
  needsCheck,
  type Access,
} from './access-state.ts';
import { browserUrl, takeToken } from './auth-token.ts';
import { App } from './App.tsx';
import { defaultStore } from './browser-store.ts';
import { saveToken, takeInvite } from './invite.ts';
import { InviteView } from './InviteView.tsx';
import { MyLinkView } from './MyLinkView.tsx';

export function AccessGate() {
  // 초대 코드를 먼저 꺼내 주소에서 지운다. 토큰 링크가 함께 있으면 토큰이 우선이다
  const [inviteCode] = useState(() => takeInvite(browserUrl()));
  const [token, setToken] = useState(() => takeToken(browserUrl(), defaultStore()));
  const [access, setAccess] = useState<Access>(() => initialAccess(token));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!needsCheck(access, token)) return;
    let cancelled = false;
    fetch('/api/me', { headers: { authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = res.ok ? ((await res.json().catch(() => null)) as { userId?: unknown } | null) : null;
        if (!cancelled) setAccess(accessFromMe({ status: res.status, userId: body?.userId }));
      })
      .catch(() => !cancelled && setAccess(accessFromMe('network_error')));
    return () => {
      cancelled = true;
    };
    // 확인은 토큰이 바뀌거나 "다시 시도"할 때만 한다(access는 그때의 값을 본다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, attempt]);

  function registered(newToken: string, userId: string) {
    setAccess(accessAfterRegister(userId, saveToken(newToken, defaultStore())));
    setToken(newToken);
  }

  function retry() {
    setAccess({ kind: 'checking' });
    setAttempt((n) => n + 1);
  }

  if (access.kind === 'ok' && token) return <App token={token} userId={access.userId} />;
  return (
    <main className="page">
      {access.kind === 'checking' && <p className="status-line">불러오는 중…</p>}
      {access.kind === 'invite' && <InviteView initialCode={inviteCode} onRegistered={registered} />}
      {access.kind === 'welcome' && token && (
        <MyLinkView token={token} saved={access.saved} onContinue={() => setAccess(accessAfterWelcome(access))} />
      )}
      {access.kind === 'failed' && (
        <section className="intro" role="alert">
          <h1 className="display">연결하지 못했어요</h1>
          <p className="lede">잠시 뒤 다시 시도해 주세요.</p>
          <button type="button" className="primary" onClick={retry}>
            다시 시도
          </button>
        </section>
      )}
    </main>
  );
}
