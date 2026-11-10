// 초대 코드 입력 (tasks.md T24). 토큰이 없거나 서버가 모르는 토큰일 때 AccessGate가 보여 준다.
// `/?invite=<코드>`로 들어왔으면 코드를 채우고 바로 보낸다. 성공하면 onRegistered로 토큰을 넘긴다.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { registerWithInvite } from './invite.ts';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'error'; message: string };

const FAILED_MESSAGE = '연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

export function InviteView({
  initialCode,
  onRegistered,
}: {
  initialCode?: string;
  onRegistered: (token: string, userId: string) => void;
}) {
  const inputId = useId();
  const [code, setCode] = useState(initialCode ?? '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const autoSent = useRef(false);

  async function send(value: string) {
    if (!value.trim()) return;
    setStatus({ kind: 'sending' });
    const result = await registerWithInvite(value);
    if (result.kind === 'ok') return onRegistered(result.token, result.userId);
    setStatus({ kind: 'error', message: result.kind === 'rejected' ? result.message : FAILED_MESSAGE });
  }

  // 링크로 받은 코드는 한 번만 자동으로 보낸다(개발 모드 StrictMode의 두 번 실행도 막는다)
  useEffect(() => {
    if (initialCode && !autoSent.current) {
      autoSent.current = true;
      void send(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(code);
  }

  const sending = status.kind === 'sending';
  return (
    <section className="intro">
      <h1 className="display">초대 코드를 넣어 주세요</h1>
      <p className="lede">받은 초대 코드를 넣으면 이 브라우저에서 바로 시작할 수 있어요. 다음부터는 코드 없이 들어와요.</p>
      <form className="invite-form" onSubmit={submit}>
        <label className="field-label" htmlFor={inputId}>
          초대 코드
        </label>
        <input
          id={inputId}
          type="text"
          value={code}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="primary" disabled={sending || !code.trim()}>
          {sending ? '확인하는 중…' : '시작하기'}
        </button>
      </form>
      {status.kind === 'error' && (
        <p className="status-line" role="alert">
          {status.message}
        </p>
      )}
    </section>
  );
}
