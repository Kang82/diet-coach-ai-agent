// 1주일 식단표 (스펙 7장). 넓은 화면은 요일 × 끼니 메뉴판, 좁은 화면은 요일별 카드. 아래에 점검 요약과 안내.
// 칸마다 "다시 추천"(스펙 4.4-4): 원하는 점을 적어 보내면 그 칸만 다시 고른다. 고르는 동안 다른 칸은 막는다.
import { useState } from 'react';
import { sameSlot } from '../core/helpers.ts';
import type { PlanCell, Slot } from '../core/types.ts';
import { DAY_LABELS, layoutPlan, MEAL_LABELS } from './plan-layout.ts';
import { slotLabel, type EditNotice, type PlanView } from './plan-view-state.ts';
import { formatClock, useElapsedSeconds } from './use-elapsed.ts';

interface Props {
  view: PlanView;
  editing: { target: Slot | undefined; startedAt: number } | undefined;
  editNotice: EditNotice | undefined;
  onEdit: (target: Slot, request: string) => void;
  onStartOver: () => void;
}

export function PlanBoard({ view, editing, editNotice, onEdit, onStartOver }: Props) {
  const { meals, days } = layoutPlan(view.plan);
  const range = `${days[0]!.date} – ${days.at(-1)!.date}`;
  const [open, setOpen] = useState<Slot>();

  const slot = (cell: PlanCell) => (
    <SlotBody
      cell={cell}
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
                return (
                  <td key={d.day} className={cellClass(cell, editNotice)}>
                    {cell ? slot(cell) : null}
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
              if (!cell) return null;
              return (
                <div key={meal} className={cellClass(cell, editNotice)}>
                  <p className="meal-label">{MEAL_LABELS[meal]}</p>
                  {slot(cell)}
                </div>
              );
            })}
          </li>
        ))}
      </ol>

      <footer className="plan-foot">
        <div>
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

/** 이번 칸 수정으로 바뀐 칸은 테두리로 강조한다 */
function cellClass(cell: PlanCell | undefined, notice: EditNotice | undefined): string {
  if (!cell) return 'slot empty';
  const changed = notice?.changed.some((c) => sameSlot(c, cell));
  return `slot ${cell.place}${changed ? ' changed' : ''}`;
}

interface SlotProps {
  cell: PlanCell;
  open: boolean;
  busy: boolean;
  editingHere: boolean;
  editStartedAt: number | undefined;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: (request: string) => void;
}

function SlotBody({ cell, open, busy, editingHere, editStartedAt, onOpen, onCancel, onSubmit }: SlotProps) {
  const [request, setRequest] = useState('');

  return (
    <>
      <p className="menu">{cell.title}</p>
      <p className="place">{cell.place === 'eat_out' ? '외식' : `집밥 ${cell.cookMinutes}분`}</p>
      <p className="reason">{cell.reason}</p>
      {cell.orderTip ? <p className="tip">주문할 때: {cell.orderTip}</p> : null}

      {editingHere && editStartedAt !== undefined ? (
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
