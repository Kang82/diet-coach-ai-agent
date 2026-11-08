// 메뉴 분류 확인 화면 (스펙 7장, 4.2, tasks.md B5). LLM이 나눈 분류를 보여 주고, 사용자가 메뉴마다 바꿀 수 있다.
// 바꾼 분류는 "식단표 만들기" 메시지에 실어 보내고 create_week_plan이 반영한다 (core/plan-request.ts).
// 고르는 중인 값은 localStorage(대화 ID별)에 두어 새로고침해도 남는다.
import { useEffect, useState } from 'react';
import { CRITERION_LABELS, MENU_CLASS_LABELS } from '../core/labels.ts';
import type { MenuClassOverride } from '../core/menu-classification.ts';
import { classStepWarning } from '../core/plan-feasibility.ts';
import { MENU_CLASSES, type MenuClass, type MenuClassification, type Profile, type Slot } from '../core/types.ts';
import { draftKey } from './browser-store.ts';

const MENU_CLASS_HINTS: Record<MenuClass, string> = {
  often: '여러 번 넣어요',
  weekly_max_1: '1주일에 1번까지',
  avoid: '식단표에 넣지 않아요',
};

export function MenuClassView({
  conversationId,
  classes,
  profile,
  events,
  onCreate,
}: {
  conversationId: string;
  classes: MenuClassification[];
  /** 사전 점검용 (B15 T11-4). 끝난 인터뷰의 프로필. 없으면 점검하지 않는다(서버가 다시 점검) */
  profile: Profile | undefined;
  /** 기간 화면에서 정한 일정 */
  events: Slot[];
  onCreate: (overrides: MenuClassOverride[]) => void;
}) {
  const key = draftKey('menuClasses', conversationId);
  const [chosen, setChosen] = useState<Record<string, MenuClass>>(() => load(key));
  useEffect(() => save(key, chosen), [key, chosen]);

  const classOf = (c: MenuClassification): MenuClass => chosen[c.menu] ?? c.class;
  const overrides = classes.filter((c) => classOf(c) !== c.class).map((c) => ({ menu: c.menu, class: classOf(c) }));
  const usable = classes.length === 0 || classes.some((c) => classOf(c) !== 'avoid');
  // 바꾼 분류와 일정으로 규칙을 지키는 식단표가 없으면 만들기를 막는다(서버도 같은 점검으로 LLM 전에 막는다)
  const infeasible = usable && profile ? classStepWarning(profile, classes.map((c) => ({ ...c, class: classOf(c) })), events) : undefined;

  return (
    <section className="menu-classes">
      <div className="step">
        <h1 className="display">외식 메뉴 분류</h1>
        <p className="lede">
          {classes.length === 0
            ? '외식하는 끼니가 없어서 분류할 메뉴가 없어요. 바로 식단표를 만들 수 있어요.'
            : '식단 기준에 맞춰 메뉴를 나눴어요. 다르게 생각하는 메뉴는 바꿔 주세요. 식단표는 이 분류대로 메뉴를 고르고 횟수를 점검해요.'}
        </p>
      </div>

      {classes.length > 0 && (
        <ul className="class-list">
          {classes.map((c) => {
            const current = classOf(c);
            const changed = current !== c.class;
            return (
              <li key={c.menu} className={`class-row${changed ? ' changed' : ''}`}>
                <fieldset>
                  <legend className="class-menu">
                    {c.menu}
                    {changed && <span className="changed-badge">바꿈</span>}
                  </legend>
                  <div className="class-options">
                    {MENU_CLASSES.map((value) => (
                      <label key={value} className={`class-option ${value}`}>
                        <input
                          type="radio"
                          name={`class-${c.menu}`}
                          value={value}
                          checked={current === value}
                          onChange={() => setChosen((prev) => ({ ...prev, [c.menu]: value }))}
                        />
                        <span>
                          {MENU_CLASS_LABELS[value]}
                          <small>{MENU_CLASS_HINTS[value]}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="class-detail">
                    <p>{changed ? `처음 분류: ${MENU_CLASS_LABELS[c.class]}. ${c.reason}` : c.reason}</p>
                    {c.criterionIds.length > 0 && (
                      <p className="class-criteria">근거: {c.criterionIds.map((id) => CRITERION_LABELS[id]).join(', ')}</p>
                    )}
                    {c.orderTips.length > 0 && current !== 'avoid' && (
                      <p className="tip">주문 팁: {c.orderTips.join(', ')}</p>
                    )}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}

      <div className="interview-foot class-foot">
        {!usable && (
          <p className="chat-alert" role="alert">
            모든 메뉴를 피하면 외식 끼니에 넣을 메뉴가 없어요. 하나 이상은 다른 분류로 바꿔 주세요.
          </p>
        )}
        {infeasible && (
          <p className="chat-alert" role="alert">
            {infeasible} 분류를 바꾸거나 "처음부터 다시"로 외식 메뉴를 고쳐 주세요.
          </p>
        )}
        <button type="button" className="primary" disabled={!usable || !!infeasible} onClick={() => onCreate(overrides)}>
          이 분류로 식단표 만들기
        </button>
        <p className="status-line">만드는 데 4분쯤 걸려요.</p>
      </div>
    </section>
  );
}

function load(key: string): Record<string, MenuClass> {
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => MENU_CLASSES.includes(v as MenuClass)),
    ) as Record<string, MenuClass>;
  } catch {
    // 저장소를 못 쓰거나 값이 깨졌으면 처음 분류로 시작한다
    return {};
  }
}

function save(key: string, value: Record<string, MenuClass>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 위와 같음
  }
}
