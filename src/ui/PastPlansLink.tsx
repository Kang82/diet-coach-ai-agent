// "지난 식단표" (tasks.md T17, 스펙 7장). 화면 아래에 늘 보이고, 누르면 그 자리에 목록을 펼친다.
// 항목을 누르면 그 대화로 옮긴다. 상태·문구는 past-plans.ts
import { useState } from 'react';
import { fetchPastPlans, PAST_PLANS_TEXT, pastPlansView, type PastPlansState } from './past-plans.ts';

export function PastPlansLink({
  token,
  conversationId,
  onOpen,
}: {
  token: string;
  conversationId: string;
  onOpen: (conversationId: string) => void;
}) {
  const [state, setState] = useState<PastPlansState>({ kind: 'idle' });
  const view = pastPlansView(state, conversationId);

  async function load() {
    setState({ kind: 'loading' });
    const items = await fetchPastPlans(token);
    setState(items ? { kind: 'list', items } : { kind: 'error' });
  }

  return (
    <div className="past-plans" aria-live="polite">
      {view.link && (
        <button type="button" className="link" onClick={load}>
          {PAST_PLANS_TEXT.link}
        </button>
      )}
      {view.message && <p className="foot-message">{view.message}</p>}
      {view.items && (
        <ul className="past-plan-list">
          {view.items.map((item) => (
            <li key={item.conversationId}>
              {item.current ? (
                <span className="past-plan current">
                  {item.label} · {PAST_PLANS_TEXT.current}
                </span>
              ) : (
                <button
                  type="button"
                  className="link past-plan"
                  onClick={() => {
                    setState({ kind: 'idle' });
                    onOpen(item.conversationId);
                  }}
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {view.close && (
        <button type="button" className="link" onClick={() => setState({ kind: 'idle' })}>
          {PAST_PLANS_TEXT.close}
        </button>
      )}
    </div>
  );
}
