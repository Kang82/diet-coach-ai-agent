// 인터뷰 화면 (스펙 7장, tasks.md B4). 정해진 답은 단계별 입력으로 받고, 단계마다 화면에서 applyTurn을 돌린다.
// 진행 상태는 localStorage(대화 ID별)에 둔다. 끝나면 제출 메시지를 한 번 보낸다(LLM은 목표 메모 확인에만 쓴다).
import { useEffect, useRef, useState } from 'react';
import { draftMeal, type InterviewSubmission } from '../core/interview-form.ts';
import { questionText } from '../core/interview-text.ts';
import type { InterviewUpdate } from '../core/types.ts';
import { advance, progressKey, resolveProgress, type FormProgress } from './interview-form-state.ts';
import type { InterviewViewState } from './interview-view-state.ts';
import { AvoidStep, CookMinutesStep, GoalsStep, MealsStep, MedicationStep, MenusStep } from './InterviewSteps.tsx';

type FormView = Extract<InterviewViewState, { kind: 'form' }>;

export function InterviewView({
  conversationId,
  view,
  onSubmit,
  onStartOver,
}: {
  conversationId: string;
  view: FormView;
  onSubmit: (submission: InterviewSubmission) => void;
  onStartOver: () => void;
}) {
  const key = progressKey(conversationId);
  const [progress, setProgress] = useState<FormProgress>(() => resolveProgress(load(key), view.serverAsk));
  const submitted = useRef(false);

  // 서버가 목표를 다시 물으면 그 상태에서 이어 간다
  const serverAskId = view.serverAsk?.id;
  useEffect(() => {
    if (serverAskId) setProgress(resolveProgress(load(key), view.serverAsk));
    // serverAsk 객체는 렌더마다 새로 만들어지므로 ID로만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, serverAskId]);

  useEffect(() => save(key, progress), [key, progress]);

  const submission: InterviewSubmission = { draft: progress.state.draft, stopFlags: progress.state.stopFlags };
  const finished = progress.next.kind === 'done';

  // 단계가 끝나면 바로 보낸다. 보내기에 실패했으면(alert) 버튼으로 다시 보낸다
  useEffect(() => {
    if (finished && !view.alert && !submitted.current) {
      submitted.current = true;
      onSubmit(submission);
    }
  });

  function answer(update: InterviewUpdate) {
    setProgress((prev) => advance(prev, update));
  }

  const next = progress.next;
  return (
    <section className="interview">
      <h1 className="display">식단 인터뷰</h1>

      {view.alert && (
        <p className="chat-alert" role="alert">
          {view.alert}
        </p>
      )}

      {progress.message && (
        <p className="step-message" role={next.kind === 'stop' ? 'alert' : 'status'}>
          {progress.message.text}
        </p>
      )}

      {next.kind === 'ask' && (
        <div className="step" key={JSON.stringify(next.field) + (next.reason ?? '')}>
          {!progress.message && <h2 className="step-title">{questionText(next.field)}</h2>}
          <Step progress={progress} onAnswer={answer} />
        </div>
      )}

      {next.kind === 'done' && (
        <div className="step">
          <p className="lede">답을 다 받았어요.</p>
          {view.alert && (
            <button type="button" className="primary" onClick={() => onSubmit(submission)}>
              다시 보내기
            </button>
          )}
        </div>
      )}

      <div className="interview-foot">
        <button type="button" className="secondary" onClick={onStartOver}>
          처음부터 다시
        </button>
      </div>
    </section>
  );
}

function Step({ progress, onAnswer }: { progress: FormProgress; onAnswer: (u: InterviewUpdate) => void }) {
  const next = progress.next;
  if (next.kind !== 'ask') return null;
  const field = next.field;
  if (field === 'goals') return <GoalsStep draft={progress.state.draft} choices={next.choices} onAnswer={onAnswer} />;
  if (field === 'medication') return <MedicationStep onAnswer={onAnswer} />;
  if (field === 'avoid') return <AvoidStep onAnswer={onAnswer} />;
  if (field === 'meals') return <MealsStep onAnswer={onAnswer} />;
  if ('menusFor' in field) {
    return (
      <MenusStep
        mealKey={field.menusFor}
        existing={draftMeal(progress.state.draft, field.menusFor)}
        followUp={next.reason === 'few_menus'}
        onAnswer={onAnswer}
      />
    );
  }
  return <CookMinutesStep mealKey={field.cookMinutesFor} onAnswer={onAnswer} />;
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 이번 창에서만 진행한다
    return null;
  }
}

function save(key: string, progress: FormProgress) {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // 위와 같음
  }
}
