// 기간 선택 화면 (스펙 7장, tasks.md B6 T5-3). 인터뷰가 끝난 뒤, 메뉴 분류 전에 보여 준다.
// 기간은 첫 시연이라 "다음 주 월~일" 한 가지. 정해진 일정(회식, 약속)이 있는 끼니를 넣으면 그 끼니는 식단표에서 뺀다.
// 넣는 중인 일정은 localStorage(대화 ID별)에 둔다. "다음"을 누르면 메뉴 분류 요청에 일정을 실어 보낸다.
import { useEffect, useId, useState, type FormEvent } from 'react';
import { nextMondayKst, slotOrder } from '../core/helpers.ts';
import type { InterviewResult } from '../core/interview.ts';
import { DAY_LABELS, MEAL_LABELS } from '../core/labels.ts';
import { EVENT_NOTE_MAX, eventSlotOptions, validateEvents } from '../core/period.ts';
import type { PlanEvent, Slot } from '../core/types.ts';
import { layoutPlan } from './plan-layout.ts';

const slotKey = (s: Slot) => `${s.day}-${s.meal}`;
const slotText = (s: Slot) => `${DAY_LABELS[s.day]} ${MEAL_LABELS[s.meal]}`;

export function PeriodView({
  conversationId,
  result,
  summary,
  alert,
  onNext,
}: {
  conversationId: string;
  result: InterviewResult;
  summary: string[];
  alert: string | undefined;
  onNext: (events: PlanEvent[]) => void;
}) {
  const key = `diet-coach:period:${conversationId}`;
  const [events, setEvents] = useState<PlanEvent[]>(() => load(key));
  useEffect(() => save(key, events), [key, events]);

  const options = eventSlotOptions(result.meals).filter((o) => !events.some((e) => slotKey(e) === slotKey(o)));
  const [slot, setSlot] = useState('');
  const [note, setNote] = useState('');
  const slotId = useId();
  const noteId = useId();

  const { days } = layoutPlan({ weekStart: nextMondayKst(new Date()), cells: [] });
  const range = `${days[0]!.date}(월) ~ ${days.at(-1)!.date}(일)`;
  const { issues } = validateEvents(result.meals, events);

  function add(e: FormEvent) {
    e.preventDefault();
    const picked = options.find((o) => slotKey(o) === slot);
    const text = note.trim();
    if (!picked || !text) return;
    setEvents((prev) => [...prev, { ...picked, note: text }].sort((a, b) => slotOrder(a) - slotOrder(b)));
    setSlot('');
    setNote('');
  }

  return (
    <section className="period">
      <div className="step">
        <h1 className="display">기간과 일정</h1>
        <p className="lede">인터뷰로 받은 내용이에요.</p>
        <ul className="interview-summary">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="step">
        <h2 className="step-title">기간: 다음 주 {range}</h2>
        <p className="status-line">지금은 1주일 식단표만 만들 수 있어요.</p>
      </div>

      <div className="step">
        <h2 className="step-title">회식이나 약속처럼 정해진 일정이 있나요?</h2>
        <p className="status-line">일정이 있는 끼니는 식단표에서 빼요. 없으면 바로 다음으로 가세요.</p>

        {events.length > 0 && (
          <ul className="event-list">
            {events.map((ev) => (
              <li key={slotKey(ev)} className="event-item">
                <span className="event-slot">{slotText(ev)}</span>
                <span>{ev.note}</span>
                <button
                  type="button"
                  className="link"
                  aria-label={`${slotText(ev)} 일정 빼기`}
                  onClick={() => setEvents((prev) => prev.filter((p) => slotKey(p) !== slotKey(ev)))}
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
        )}

        {options.length > 0 && (
          <form className="event-form" onSubmit={add}>
            <label className="field-label" htmlFor={slotId}>
              끼니
            </label>
            <select id={slotId} value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="">고르기</option>
              {options.map((o) => (
                <option key={slotKey(o)} value={slotKey(o)}>
                  {slotText(o)}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor={noteId}>
              일정
            </label>
            <input
              id={noteId}
              type="text"
              value={note}
              maxLength={EVENT_NOTE_MAX}
              placeholder="예: 팀 회식"
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" className="secondary" disabled={!slot || !note.trim()}>
              일정 넣기
            </button>
          </form>
        )}
      </div>

      <div className="interview-foot class-foot">
        {(alert || issues.length > 0) && (
          <p className="chat-alert" role="alert">
            {alert ?? '일정을 다시 확인해 주세요.'}
          </p>
        )}
        <button type="button" className="primary" disabled={issues.length > 0} onClick={() => onNext(events)}>
          다음: 외식 메뉴 분류
        </button>
      </div>
    </section>
  );
}

function load(key: string): PlanEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value)
      ? value.filter((e): e is PlanEvent => !!e && typeof e.day === 'string' && typeof e.meal === 'string' && typeof e.note === 'string')
      : [];
  } catch {
    // 저장소를 못 쓰거나 값이 깨졌으면 일정 없이 시작한다
    return [];
  }
}

function save(key: string, events: PlanEvent[]) {
  try {
    localStorage.setItem(key, JSON.stringify(events));
  } catch {
    // 위와 같음
  }
}
