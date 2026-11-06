// 식단표 화면 (스펙 7장). 프로필은 인터뷰(T4)가 생기기 전까지 페르소나 A로 고정이다.
// 대화 ID를 localStorage에 두어 새로고침하거나 창을 닫았다 열어도 같은 대화(진행 상태나 결과)를 다시 읽는다.
import { useFlueAgent } from '@flue/react';
import { useState } from 'react';
import { newConversationId } from './conversation-id.ts';
import { PlanBoard } from './PlanBoard.tsx';
import { toPlanViewState } from './plan-view-state.ts';
import { WaitingView } from './WaitingView.tsx';

const CONVERSATION_KEY = 'diet-coach:conversation';
const REQUEST = '식단표 만들어 줘';

export function App() {
  const [conversationId, setConversationId] = useState(loadConversationId);
  const [sentAt, setSentAt] = useState<number>();
  const agent = useFlueAgent({ url: `/agents/diet-coach/${conversationId}` });
  const view = toPlanViewState(agent);

  async function create() {
    setSentAt(Date.now());
    await agent.sendMessage(REQUEST);
  }

  function startOver() {
    const id = newConversationId();
    saveConversationId(id);
    setSentAt(undefined);
    setConversationId(id);
  }

  return (
    <main className="page">
      {view.kind === 'loading' && <p className="status-line">불러오는 중…</p>}

      {view.kind === 'idle' && (
        <section className="intro">
          <h1 className="display">다음 주 식단표</h1>
          <p className="lede">
            평일 점심 외식 메뉴와 저녁 집밥 조건에 맞춰 1주일 식단을 짭니다. 만드는 데 4분쯤 걸려요.
          </p>
          <button type="button" className="primary" onClick={create}>
            식단표 만들기
          </button>
        </section>
      )}

      {view.kind === 'creating' && (
        <WaitingView startedAt={view.startedAt ? Date.parse(view.startedAt) : (sentAt ?? Date.now())} />
      )}

      {view.kind === 'done' && <PlanBoard output={view.output} onStartOver={startOver} />}

      {(view.kind === 'violations' || view.kind === 'quota' || view.kind === 'error') && (
        <section className="intro" role="alert">
          <h1 className="display">식단표를 만들지 못했어요</h1>
          <p className="lede">{view.message}</p>
          <button type="button" className="primary" onClick={startOver}>
            처음부터 다시 만들기
          </button>
        </section>
      )}
    </main>
  );
}

function loadConversationId(): string {
  try {
    const saved = localStorage.getItem(CONVERSATION_KEY);
    if (saved) return saved;
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 이번 창에서만 쓰는 ID로 진행한다
  }
  const id = newConversationId();
  saveConversationId(id);
  return id;
}

function saveConversationId(id: string) {
  try {
    localStorage.setItem(CONVERSATION_KEY, id);
  } catch {
    // 위와 같음
  }
}
