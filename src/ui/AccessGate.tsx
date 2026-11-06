// 사용자 링크 토큰 확인 (스펙 11.4-1, B8). 토큰으로 /api/me를 불러 사용자 ID를 받은 뒤 App을 보여 준다.
// 토큰이 없거나 서버가 모르는 토큰이면 받은 링크로 들어와 달라고 안내한다.
import { useEffect, useState } from 'react';
import { browserUrl, takeToken } from './auth-token.ts';
import { App } from './App.tsx';
import { defaultStore } from './browser-store.ts';

type Access =
  | { kind: 'checking' }
  | { kind: 'denied' }
  | { kind: 'failed' }
  | { kind: 'ok'; userId: string };

export function AccessGate() {
  const [token] = useState(() => takeToken(browserUrl(), defaultStore()));
  const [access, setAccess] = useState<Access>(token ? { kind: 'checking' } : { kind: 'denied' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setAccess({ kind: 'checking' });
    fetch('/api/me', { headers: { authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setAccess({ kind: 'denied' });
        if (!res.ok) return setAccess({ kind: 'failed' });
        const { userId } = (await res.json()) as { userId: string };
        if (!cancelled) setAccess({ kind: 'ok', userId });
      })
      .catch(() => !cancelled && setAccess({ kind: 'failed' }));
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  if (access.kind === 'ok' && token) return <App token={token} userId={access.userId} />;
  return (
    <main className="page">
      {access.kind === 'checking' && <p className="status-line">불러오는 중…</p>}
      {access.kind === 'denied' && (
        <section className="intro" role="alert">
          <h1 className="display">받은 링크로 들어와 주세요</h1>
          <p className="lede">이 서비스는 개인 링크로만 쓸 수 있어요. 받은 링크를 그대로 열어 주세요.</p>
        </section>
      )}
      {access.kind === 'failed' && (
        <section className="intro" role="alert">
          <h1 className="display">연결하지 못했어요</h1>
          <p className="lede">잠시 뒤 다시 시도해 주세요.</p>
          <button type="button" className="primary" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </button>
        </section>
      )}
    </main>
  );
}
