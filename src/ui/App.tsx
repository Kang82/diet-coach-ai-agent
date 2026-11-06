// (첫 화면 분기) → 인터뷰 → 프로필 확인 → 기간 선택 → 메뉴 분류 확인 → 식단표 (스펙 7장, tasks.md B4~B6).
// 단계마다 앞 단계가 끝난 뒤의 메시지를 다음 화면 상태에 넘긴다. 식단표는 끝난 인터뷰와 확인한 메뉴 분류, 기간으로 만든다.
// 프로필은 저장에 동의했을 때만 이 브라우저(localStorage)에 둔다 (saved-profile.ts).
// 대화별 진행 값(인터뷰 답, 일정, 고르던 분류)은 그 단계가 끝나면 지운다 (browser-store.ts, 리뷰 4번).
// 대화 ID를 localStorage에 두어 새로고침하거나 창을 닫았다 열어도 같은 대화(진행 상태나 결과)를 다시 읽는다.
import { useFlueAgent } from '@flue/react';
import { useEffect, useState } from 'react';
import { formatEditRequest } from '../core/edit-request.ts';
import { formatInterviewSubmission, type InterviewSubmission } from '../core/interview-form.ts';
import type { MenuClassOverride } from '../core/menu-classification.ts';
import { formatClassifyRequest, formatPlanRequest } from '../core/plan-request.ts';
import { draftFromResult } from '../core/profile-edit.ts';
import type { PlanEvent } from '../core/types.ts';
import { clearAll, clearDrafts, CONVERSATION_KEY, defaultStore, draftKey } from './browser-store.ts';
import { progressFromResult } from './interview-form-state.ts';
import { PeriodView } from './PeriodView.tsx';
import { loadSavedProfile, rememberResult } from './saved-profile.ts';
import { defaultConsentFor, shouldOfferSaved, type StartChoice as StartChoiceKind } from './start-choice-state.ts';
import { StartChoice } from './StartChoice.tsx';
import { InterviewView } from './InterviewView.tsx';
import { toInterviewViewState } from './interview-view-state.ts';
import type { Slot } from '../core/types.ts';
import { newConversationId } from './conversation-id.ts';
import { toMenuClassViewState } from './menu-class-view-state.ts';
import { MenuClassView } from './MenuClassView.tsx';
import { PlanBoard } from './PlanBoard.tsx';
import { toPlanViewState } from './plan-view-state.ts';
import { WaitingView } from './WaitingView.tsx';

export function App() {
  const [conversationId, setConversationId] = useState(loadConversationId);
  const [sentAt, setSentAt] = useState<number>();
  const agent = useFlueAgent({ url: `/agents/diet-coach/${conversationId}` });
  const interview = toInterviewViewState(agent);
  const menu = interview.kind === 'done' ? toMenuClassViewState({ ...agent, messages: interview.planMessages }) : undefined;
  const view = menu?.kind === 'classified' ? toPlanViewState({ ...agent, messages: menu.planMessages }) : undefined;

  // 첫 화면 분기 (T5-5): 저장한 프로필이 있고 이 대화의 인터뷰를 아직 시작하지 않았으면 고르게 한다
  const [saved, setSaved] = useState(loadSavedProfile);
  const [choice, setChoice] = useState<StartChoiceKind>();
  const offerSaved = shouldOfferSaved({
    hasSaved: !!saved,
    decided: choice !== undefined,
    interview,
    hasProgress: hasProgress(conversationId),
  });

  // 인터뷰가 끝나면 저장 동의에 따라 프로필을 저장하거나 지우고, 이 대화의 인터뷰 진행 값을 지운다
  const doneResult = interview.kind === 'done' ? JSON.stringify(interview.result) : undefined;
  useEffect(() => {
    if (!doneResult) return;
    rememberResult(JSON.parse(doneResult));
    clearDrafts(conversationId, ['interview']);
    setSaved(loadSavedProfile());
  }, [doneResult, conversationId]);

  // 분류가 끝나면 일정, 식단표가 나오면 고르던 분류를 지운다 (서버에 저장돼 있다)
  const classified = menu?.kind === 'classified';
  const planDone = view?.kind === 'done';
  useEffect(() => {
    if (classified) clearDrafts(conversationId, ['period']);
    if (planDone) clearDrafts(conversationId, ['menuClasses']);
  }, [classified, planDone, conversationId]);

  /** 인터뷰 제출. 도구가 이 메시지를 직접 해석하므로 형식은 formatInterviewSubmission으로만 만든다. */
  async function submitInterview(submission: InterviewSubmission) {
    await agent.sendMessage(formatInterviewSubmission(submission));
  }

  /** 기간 선택의 "다음": 일정을 실어 메뉴 분류를 요청한다 (스펙 4.2). 메뉴는 도구가 인터뷰 결과에서 직접 읽는다 */
  async function classify(events: PlanEvent[]) {
    setSentAt(Date.now());
    await agent.sendMessage(formatClassifyRequest({ events }));
  }

  /** 지난 프로필로 시작: 저장한 결과를 그대로 제출한다. 보내기에 실패하면 확인 화면에서 다시 보낸다 */
  async function startWithSaved() {
    if (!saved) return;
    saveProgress(conversationId, progressFromResult(saved.result));
    setChoice('use_saved');
    await submitInterview({ draft: draftFromResult(saved.result), stopFlags: [], consent: true });
  }

  /** 바뀐 항목 고치기: 저장한 결과로 프로필 확인 화면부터 */
  function editSaved() {
    if (!saved) return;
    saveProgress(conversationId, progressFromResult(saved.result));
    setChoice('edit_saved');
  }

  /** 이 브라우저에 저장한 내 정보(프로필, 대화별 진행 값)를 모두 지운다 */
  function forgetAll() {
    clearAll();
    setSaved(undefined);
  }

  /** 식단표 만들기 실패 뒤 같은 대화에 같은 메시지(바꾼 분류 포함)를 다시 보낸다 (리뷰 3번) */
  async function retryCreate(body: string) {
    setSentAt(Date.now());
    await agent.sendMessage(body);
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

  /** 새 대화로 시작한다. 두고 가는 대화의 진행 값(건강 정보)은 지운다 (리뷰 4번) */
  function startOver() {
    clearDrafts(conversationId, ['interview', 'period', 'menuClasses']);
    const id = newConversationId();
    saveConversationId(id);
    setSentAt(undefined);
    setChoice(undefined);
    setConversationId(id);
  }

  return (
    <main className="page">
      {interview.kind === 'loading' && <p className="status-line">불러오는 중…</p>}

      {offerSaved && saved && (
        <StartChoice
          saved={saved}
          onUseSaved={startWithSaved}
          onEditSaved={editSaved}
          onFresh={() => setChoice('fresh')}
          onForget={forgetAll}
        />
      )}

      {interview.kind === 'form' && !offerSaved && (
        <InterviewView
          key={conversationId}
          conversationId={conversationId}
          view={interview}
          defaultConsent={defaultConsentFor(choice)}
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
        <PeriodView
          key={conversationId}
          conversationId={conversationId}
          result={interview.result}
          summary={interview.summary}
          alert={menu.alert}
          onNext={classify}
        />
      )}

      {menu?.kind === 'classifying' && (
        <section className="intro" aria-live="polite">
          <h1 className="display">외식 메뉴를 나누는 중이에요</h1>
          <p className="lede">보통 1~2분 걸려요. 이 창을 닫았다 다시 열어도 이어서 볼 수 있어요.</p>
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
          <div className="choices">
            {view.retry && (
              <button type="button" className="primary" onClick={() => retryCreate(view.retry!)}>
                다시 시도
              </button>
            )}
            <button type="button" className={view.retry ? 'secondary' : 'primary'} onClick={startOver}>
              처음부터 다시
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

/** 서버 시각이 아직 없으면(보낸 직후) 이 창에서 보낸 시각을 쓴다 */
function toTime(serverTime: string | undefined, sentAt: number | undefined): number {
  return serverTime ? Date.parse(serverTime) : (sentAt ?? Date.now());
}

/** 이 대화의 인터뷰 진행이 저장돼 있는지 (있으면 첫 화면 분기를 보여 주지 않는다) */
function hasProgress(conversationId: string): boolean {
  try {
    return (defaultStore()?.getItem(draftKey('interview', conversationId)) ?? null) !== null;
  } catch {
    return false;
  }
}

function saveProgress(conversationId: string, progress: unknown) {
  try {
    defaultStore()?.setItem(draftKey('interview', conversationId), JSON.stringify(progress));
  } catch {
    // 저장소를 못 쓰면 이번 창에서는 처음 단계부터 보인다
  }
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
