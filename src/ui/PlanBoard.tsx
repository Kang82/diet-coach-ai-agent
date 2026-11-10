// 1주일 식단표 (스펙 7장). 넓은 화면은 요일 × 끼니 메뉴판, 좁은 화면은 요일별 카드. 아래에 점검 요약과 안내.
// 칸마다 "다시 추천"(스펙 4.4-4): 원하는 점을 적어 보내면 그 칸만 다시 고른다. 고르는 동안 다른 칸은 막는다.
// 칸마다 "먹었어요" 체크(T25): 서버(/api/checks)에 남기고 아래에 "이번 주 N/M칸"을 보인다. 체크한 칸은 다시 추천을 숨긴다.
import { useEffect, useState } from 'react';
import { sameSlot } from '../core/helpers.ts';
import type { PlanCell, Slot } from '../core/types.ts';
import { checkSummary, fetchChecks, isChecked, saveCheck, withCheck } from './plan-checks.ts';
import { DAY_LABELS, layoutPlan, MEAL_LABELS } from './plan-layout.ts';
import { slotLabel, type EditNotice, type PlanView } from './plan-view-state.ts';
import { formatClock, useElapsedSeconds } from './use-elapsed.ts';

interface Props {
  view: PlanView;
  editing: { target: Slot | undefined; startedAt: number } | undefined;
  editNotice: EditNotice | undefined;
  onEdit: (target: Slot, request: string) => void;
  onStartOver: () => void;
  token: string;
  conversationId: string;
}

/** 이 대화의 체크. 불러오기 전에는 undefined(체크박스를 막는다) */
function usePlanChecks(token: string, conversationId: string) {
  const [checks, setChecks] = useState<Slot[]>();
  const [saving, setSaving] = useState<Slot[]>([]);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setChecks(undefined);
    fetchChecks(token, conversationId).then((loaded) => {
      if (cancelled) return;
      // 못 불러오면 빈 목록으로 두고 알린다. 체크는 계속 할 수 있다
      setChecks(loaded ?? []);
      setMessage(loaded ? undefined : '먹었어요 체크를 불러오지 못했어요.');
    });
    return () => {
      cancelled = true;
    };
  }, [token, conversationId]);

  async function toggle(slot: Slot, eaten: boolean) {
    setMessage(undefined);
    setChecks((prev) => withCheck(prev ?? [], slot, eaten));
    setSaving((prev) => withCheck(prev, slot, true));
    const result = await saveCheck(token, conversationId, slot, eaten);
    setSaving((prev) => withCheck(prev, slot, false));
    if (!result.ok) {
      setChecks((prev) => withCheck(prev ?? [], slot, !eaten));
      setMessage(result.message);
    }
  }

  return { checks, saving, message, toggle };
}

export function PlanBoard({ view, editing, editNotice, onEdit, onStartOver, token, conversationId }: Props) {
  const { meals, days } = layoutPlan(view.plan);
  const range = `${days[0]!.date} – ${days.at(-1)!.date}`;
  const [open, setOpen] = useState<Slot>();
  const { checks, saving, message: checkMessage, toggle } = usePlanChecks(token, conversationId);

  const slot = (cell: PlanCell) => (
    <SlotBody
      cell={cell}
      checked={!!checks && isChecked(checks, cell)}
      checkDisabled={!checks || isChecked(saving, cell) || (!!editing?.target && sameSlot(editing.target, cell))}
      onCheck={(eaten) => toggle({ day: cell.day, meal: cell.meal }, eaten)}
      open={!!open && sameSlot(open, cell)}
      busy={!!editing}
      editingHere={!!editing?.target && sameSlot(editing.target, cell)}
      editStartedAt={editing?.startedAt}
      onOpen={() => setOpen({ day: cell.day, meal: cell.meal })}
      onCancel={() => setOpen(undefined)}
      onSubmit={(request) => {
        setOpen(undefined);
        onEdit({ day: cell.day, meal: cell.meal }, request);
      }}
    />
  );

  return (
    <section className="plan">
      <header className="plan-head">
        <h1 className="display">{range} 식단표</h1>
        <button type="button" className="secondary" onClick={onStartOver} disabled={!!editing}>
          새로 만들기
        </button>
      </header>

      <div className="edit-status" aria-live="polite">
        {editing ? (
          <p className="notice info">
            {editing.target
              ? `${slotLabel(editing.target)}을 다시 고르는 중이에요. 1~2분쯤 걸려요.`
              : '칸을 다시 고르는 중이에요.'}
          </p>
        ) : editNotice ? (
          <div className={`notice ${editNotice.tone}`}>
            {editNotice.messages.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        ) : null}
      </div>

      {/* 넓은 화면: 메뉴판 */}
      <table className="board">
        <thead>
          <tr>
            <th scope="col" className="corner" />
            {days.map((d) => (
              <th scope="col" key={d.day} className={d.day === 'sat' || d.day === 'sun' ? 'weekend' : undefined}>
                <span className="day">{DAY_LABELS[d.day].charAt(0)}</span>
                <span className="date">{d.date}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meals.map((meal, mi) => (
            <tr key={meal}>
              <th scope="row" className="meal">
                {MEAL_LABELS[meal]}
              </th>
              {days.map((d) => {
                const cell = d.cells[mi];
                const event = d.events[mi];
                return (
                  <td key={d.day} className={event ? 'slot event' : cellClass(cell, editNotice)}>
                    {cell ? slot(cell) : event ? <EventBody note={event.note} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 좁은 화면: 요일별 카드 */}
      <ol className="cards">
        {days.map((d) => (
          <li key={d.day} className="card">
            <h2 className="card-day">
              {DAY_LABELS[d.day]} <span className="date">{d.date}</span>
            </h2>
            {meals.map((meal, mi) => {
              const cell = d.cells[mi];
              const event = d.events[mi];
              if (!cell && !event) return null;
              return (
                <div key={meal} className={cell ? cellClass(cell, editNotice) : 'slot event'}>
                  <p className="meal-label">{MEAL_LABELS[meal]}</p>
                  {cell ? slot(cell) : <EventBody note={event!.note} />}
                </div>
              );
            })}
          </li>
        ))}
      </ol>

      <footer className="plan-foot">
        <div>
          <p className="check-summary" aria-live="polite">
            {checks ? checkSummary(view.plan.cells, checks) : '먹었어요 체크를 불러오는 중…'}
          </p>
          {checkMessage && (
            <p className="check-error" role="alert">
              {checkMessage}
            </p>
          )}
          <h2 className="foot-title">규칙 점검</h2>
          <ul className="checks">
            {view.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="notices">
          {view.notices.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </footer>
    </section>
  );
}

/** 일정(회식, 약속)이 있는 끼니. 식단표 칸이 없고 다시 추천도 없다 (B6) */
function EventBody({ note }: { note: string }) {
  return (
    <>
      <p className="menu">{note}</p>
      <p className="place">일정</p>
    </>
  );
}

/** 이번 칸 수정으로 바뀐 칸은 테두리로 강조한다 */
function cellClass(cell: PlanCell | undefined, notice: EditNotice | undefined): string {
  if (!cell) return 'slot empty';
  const changed = notice?.changed.some((c) => sameSlot(c, cell));
  return `slot ${cell.place}${changed ? ' changed' : ''}`;
}

interface SlotProps {
  cell: PlanCell;
  checked: boolean;
  checkDisabled: boolean;
  onCheck: (eaten: boolean) => void;
  open: boolean;
  busy: boolean;
  editingHere: boolean;
  editStartedAt: number | undefined;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: (request: string) => void;
}

function SlotBody({
  cell,
  checked,
  checkDisabled,
  onCheck,
  open,
  busy,
  editingHere,
  editStartedAt,
  onOpen,
  onCancel,
  onSubmit,
}: SlotProps) {
  const [request, setRequest] = useState('');

  return (
    <>
      <p className="menu">{cell.title}</p>
      <p className="place">{cell.place === 'eat_out' ? '외식' : `집밥 ${cell.cookMinutes}분`}</p>
      <p className="reason">{cell.reason}</p>
      {cell.orderTip ? <p className="tip">주문할 때: {cell.orderTip}</p> : null}

      <label className="eaten">
        <input
          type="checkbox"
          checked={checked}
          disabled={checkDisabled}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={`${slotLabel(cell)} 먹었어요`}
        />
        먹었어요
      </label>

      {checked ? null : editingHere && editStartedAt !== undefined ? (
        <EditingBadge startedAt={editStartedAt} />
      ) : open ? (
        <form
          className="edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(request);
            setRequest('');
          }}
        >
          <label className="edit-label">
            원하는 점 (선택)
            <input
              type="text"
              name="request"
              autoComplete="off"
              maxLength={100}
              placeholder="예: 생선 말고, 더 가볍게…"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
          </label>
          <div className="edit-actions">
            <button type="submit" className="small primary">
              이 칸 다시 추천
            </button>
            <button type="button" className="small secondary" onClick={onCancel}>
              취소
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="link"
          onClick={onOpen}
          disabled={busy}
          aria-label={`${slotLabel(cell)} 다시 추천`}
        >
          다시 추천
        </button>
      )}
    </>
  );
}

function EditingBadge({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <p className="editing-badge" role="timer">
      다시 고르는 중… {formatClock(elapsed)}
    </p>
  );
}
