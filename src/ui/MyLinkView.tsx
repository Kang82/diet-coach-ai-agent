// 개인 링크 안내 (tasks.md T24). 초대 코드로 토큰을 받은 직후와 화면 아래 "다른 기기에서 열기"에서 보여 준다.
// 토큰은 이 브라우저(localStorage)에만 있어서, 링크를 저장해 두어야 다른 기기·브라우저에서 같은 기록으로 이어진다.
import { useState } from 'react';
import { personalLink } from './invite.ts';

export function MyLinkBody({ token }: { token: string }) {
  const link = personalLink(location.origin, token);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <div className="my-link">
      <p className="lede">
        이 링크를 저장해 두면 다른 기기나 브라우저에서도 같은 기록으로 이어서 쓸 수 있어요. 링크를 가진 사람은 누구나 내 기록을 볼 수
        있으니 다른 사람에게 보내지 마세요.
      </p>
      <input className="my-link-url" type="text" readOnly value={link} aria-label="개인 링크" onFocus={(e) => e.target.select()} />
      <div className="choices">
        <button type="button" className="secondary" onClick={copy}>
          링크 복사
        </button>
        {copied === 'ok' && <span className="foot-message">복사했어요.</span>}
        {copied === 'failed' && <span className="foot-message">복사하지 못했어요. 위 링크를 직접 선택해 복사해 주세요.</span>}
      </div>
    </div>
  );
}

/** 토큰을 받은 직후 한 번 보여 주는 화면. saved=false면 이 브라우저에 저장하지 못한 것(사생활 보호 창 등) */
export function MyLinkView({ token, saved, onContinue }: { token: string; saved: boolean; onContinue: () => void }) {
  return (
    <section className="intro">
      <h1 className="display">준비됐어요</h1>
      {!saved && (
        <p className="status-line" role="alert">
          이 브라우저에 저장하지 못했어요. 창을 닫거나 새로고침하면 다시 들어올 수 없으니 아래 링크를 꼭 저장해 주세요.
        </p>
      )}
      <MyLinkBody token={token} />
      <button type="button" className="primary" onClick={onContinue}>
        시작하기
      </button>
    </section>
  );
}

/** 화면 아래 "다른 기기에서 열기" */
export function MyLinkFoot({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-link-foot">
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '링크 닫기' : '다른 기기에서 열기'}
      </button>
      {open && <MyLinkBody token={token} />}
    </div>
  );
}
