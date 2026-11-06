// 인터뷰 → 식단표 화면 (스펙 7장). 인터뷰가 끝나면 그 뒤 메시지로 식단표 화면을 그린다 (tasks.md B4).
// 식단표는 메뉴 분류(B5) 전까지 인터뷰 결과가 아니라 페르소나 A로 만든다.
// 대화 ID를 localStorage에 두어 새로고침하거나 창을 닫았다 열어도 같은 대화(진행 상태나 결과)를 다시 읽는다.
import { useFlueAgent } from '@flue/react';
import { useState } from 'react';
import { formatEditRequest } from '../core/edit-request.ts';
import { formatInterviewSubmission, type InterviewSubmission } from '../core/interview-form.ts';
import { InterviewView } from './InterviewView.tsx';
import { toInterviewViewState } from './interview-view-state.ts';
import type { Slot } from '../core/types.ts';
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
  const interview = toInterviewViewState(agent);
  const view = interview.kind === 'done' ? toPlanViewState({ ...agent, messages: interview.planMessages }) : undefined;

  /** 인터뷰 제출. 도구가 이 메시지를 직접 해석하므로 형식은 formatInterviewSubmission으로만 만든다. */
  async function submitInterview(submission: InterviewSubmission) {
    await agent.sendMessage(formatInterviewSubmission(submission));
  }

  async function create() {
    setSentAt(Date.now());
    await agent.sendMessage(REQUEST);
  }

  /** 칸 다시 추천 (스펙 4.4-4). 도구가 이 메시지를 직접 해석하므로 형식은 formatEditRequest로만 만든다. */
  async function edit(target: Slot, request: string) {
    setSentAt(Date.now());
    await agent.sendMessage(formatEditRequest({ target, request }));
  }

  function startOver() {
    const id = newConversationId();
    saveConversationId(id);
    setSentAt(undefined);
    setConversationId(id);
  }

  return (
    <main className="page">
      {interview.kind === 'loading' && <p className="status-line">불러오는 중…</p>}

      {interview.kind === 'form' && (
        <InterviewView
          key={conversationId}
          conversationId={conversationId}
          view={interview}
          onSubmit={submitInterview}
          onStartOver={startOver}
        />
      )}

      {interview.kind === 'submitting' && (
        <section className="intro">
          <h1 className="display">답을 확인하는 중이에요</h1>
          <p className="lede">목표 메모를 확인하고 있어요. 보통 30초 안에 끝나요.</p>
        </section>
      )}

      {interview.kind === 'stopped' && (
        <section className="intro" role="alert">
          <h1 className="display">식단표를 만들 수 없어요</h1>
          <p className="lede step-message-text">{interview.message.text}</p>
          <button type="button" className="secondary" onClick={startOver}>
            처음부터 다시
          </button>
        </section>
      )}

      {view?.kind === 'idle' && interview.kind === 'done' && (
        <section className="intro">
          <h1 className="display">다음 주 식단표</h1>
          <p className="lede">인터뷰로 받은 내용이에요.</p>
          <ul className="interview-summary">
            {interview.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="lede">
            지금은 메뉴 분류 단계가 없어서 예시 프로필(평일 점심 외식, 저녁 집밥)로 식단표를 만들어요. 만드는 데
            4분쯤 걸려요.
          </p>
          <button type="button" className="primary" onClick={create}>
            식단표 만들기
          </button>
        </section>
      )}

      {view?.kind === 'creating' && (
        <WaitingView startedAt={toTime(view.startedAt, sentAt)} />
      )}

      {view?.kind === 'done' && (
        <PlanBoard
          view={view.view}
          editing={view.editing && { ...view.editing, startedAt: toTime(view.editing.startedAt, sentAt) }}
          editNotice={view.editNotice}
          onEdit={edit}
          onStartOver={startOver}
        />
      )}

      {(view?.kind === 'violations' || view?.kind === 'quota' || view?.kind === 'error') && (
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

/** 서버 시각이 아직 없으면(보낸 직후) 이 창에서 보낸 시각을 쓴다 */
function toTime(serverTime: string | undefined, sentAt: number | undefined): number {
  return serverTime ? Date.parse(serverTime) : (sentAt ?? Date.now());
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
