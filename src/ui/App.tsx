// 인터뷰 → 메뉴 분류 확인 → 식단표 화면 (스펙 7장). 단계마다 앞 단계가 끝난 뒤의 메시지를 다음 화면 상태에 넘긴다 (tasks.md B4, B5).
// 식단표는 끝난 인터뷰와 확인한 메뉴 분류로 만든다.
// 대화 ID를 localStorage에 두어 새로고침하거나 창을 닫았다 열어도 같은 대화(진행 상태나 결과)를 다시 읽는다.
import { useFlueAgent } from '@flue/react';
import { useState } from 'react';
import { formatEditRequest } from '../core/edit-request.ts';
import { formatInterviewSubmission, type InterviewSubmission } from '../core/interview-form.ts';
import type { MenuClassOverride } from '../core/menu-classification.ts';
import { CLASSIFY_REQUEST, formatPlanRequest } from '../core/plan-request.ts';
import { InterviewView } from './InterviewView.tsx';
import { toInterviewViewState } from './interview-view-state.ts';
import type { Slot } from '../core/types.ts';
import { newConversationId } from './conversation-id.ts';
import { toMenuClassViewState } from './menu-class-view-state.ts';
import { MenuClassView } from './MenuClassView.tsx';
import { PlanBoard } from './PlanBoard.tsx';
import { toPlanViewState } from './plan-view-state.ts';
import { WaitingView } from './WaitingView.tsx';

const CONVERSATION_KEY = 'diet-coach:conversation';

export function App() {
  const [conversationId, setConversationId] = useState(loadConversationId);
  const [sentAt, setSentAt] = useState<number>();
  const agent = useFlueAgent({ url: `/agents/diet-coach/${conversationId}` });
  const interview = toInterviewViewState(agent);
  const menu = interview.kind === 'done' ? toMenuClassViewState({ ...agent, messages: interview.planMessages }) : undefined;
  const view = menu?.kind === 'classified' ? toPlanViewState({ ...agent, messages: menu.planMessages }) : undefined;

  /** 인터뷰 제출. 도구가 이 메시지를 직접 해석하므로 형식은 formatInterviewSubmission으로만 만든다. */
  async function submitInterview(submission: InterviewSubmission) {
    await agent.sendMessage(formatInterviewSubmission(submission));
  }

  /** 메뉴 분류 요청 (스펙 4.2). 메뉴는 도구가 인터뷰 결과에서 직접 읽는다 */
  async function classify() {
    setSentAt(Date.now());
    await agent.sendMessage(CLASSIFY_REQUEST);
  }

  /** 식단표 만들기. 사용자가 바꾼 분류를 메시지에 싣는다. 형식은 formatPlanRequest로만 만든다 */
  async function create(overrides: MenuClassOverride[]) {
    setSentAt(Date.now());
    await agent.sendMessage(formatPlanRequest({ overrides }));
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

      {menu?.kind === 'loading' && <p className="status-line">불러오는 중…</p>}

      {menu?.kind === 'idle' && interview.kind === 'done' && (
        <section className="intro">
          <h1 className="display">다음 주 식단표</h1>
          <p className="lede">인터뷰로 받은 내용이에요.</p>
          <ul className="interview-summary">
            {interview.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="lede">다음은 외식 메뉴를 식단 기준에 맞춰 나누고 확인하는 단계예요.</p>
          {menu.alert && (
            <p className="chat-alert" role="alert">
              {menu.alert}
            </p>
          )}
          <button type="button" className="primary" onClick={classify}>
            {menu.alert ? '다시 분류하기' : '외식 메뉴 분류하기'}
          </button>
        </section>
      )}

      {menu?.kind === 'classifying' && (
        <section className="intro" aria-live="polite">
          <h1 className="display">외식 메뉴를 나누는 중이에요</h1>
          <p className="lede">보통 30초 안에 끝나요.</p>
        </section>
      )}

      {view?.kind === 'idle' && menu?.kind === 'classified' && (
        <MenuClassView key={conversationId} conversationId={conversationId} classes={menu.classes} onCreate={create} />
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
