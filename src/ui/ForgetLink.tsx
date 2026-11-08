// "내 기록 모두 지우기" (tasks.md T15, 스펙 5장). 모든 화면 아래에 늘 보인다. 저장 동의와 관계없이 이 링크로 남긴
// 대화(Durable Object)와 저장한 프로필·식단표를 지운다. 상태와 문구는 forget-state.ts
import { useState } from 'react';
import { FORGET_TEXT, forgetResultState, forgetView, type ForgetState } from './forget-state.ts';
import type { DeleteResult } from './saved-profile.ts';

export function ForgetLink({ onForget }: { onForget: () => Promise<DeleteResult> }) {
  const [state, setState] = useState<ForgetState>({ kind: 'idle' });
  const view = forgetView(state);

  async function forget() {
    setState({ kind: 'deleting' });
    setState(forgetResultState(await onForget()));
  }

  return (
    <footer className="forget" aria-live="polite">
      {view.message && <p className="forget-message">{view.message}</p>}
      {view.confirm && (
        <div className="choices">
          <button type="button" className="secondary danger" onClick={forget}>
            {FORGET_TEXT.confirm}
          </button>
          <button type="button" className="secondary" onClick={() => setState({ kind: 'idle' })}>
            {FORGET_TEXT.cancel}
          </button>
        </div>
      )}
      {view.link && (
        <button type="button" className="link" onClick={() => setState({ kind: 'confirming' })}>
          {FORGET_TEXT.link}
        </button>
      )}
    </footer>
  );
}
