// 메뉴 분류 확인 화면 (스펙 7장, 4.2, tasks.md B5). LLM이 나눈 분류를 보여 주고, 사용자가 메뉴마다 바꿀 수 있다.
// 바꾼 분류는 "식단표 만들기" 메시지에 실어 보내고 create_week_plan이 반영한다 (core/plan-request.ts).
// 고르는 중인 값은 localStorage(대화 ID별)에 두어 새로고침해도 남는다.
// B16: 목록을 외식 끼니별로 묶고, 메뉴가 모자란 끼니에 해결 방법(분류 바꾸기, 메뉴 더 넣기)을 보인다(class-groups.ts).
import { useEffect, useMemo, useState } from 'react';
import { CRITERION_LABELS, MENU_CLASS_LABELS } from '../core/labels.ts';
import { applyClassOverrides, type MenuClassOverride } from '../core/menu-classification.ts';
import { classStepWarning } from '../core/plan-feasibility.ts';
import { MENU_CLASSES, type MenuClass, type MenuClassification, type Profile, type Slot } from '../core/types.ts';
import { draftKey } from './browser-store.ts';
import { classGroupsView } from './class-groups.ts';

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
  onEditMenus,
}: {
  conversationId: string;
  classes: MenuClassification[];
  /** 사전 점검용 (B15 T11-4). 끝난 인터뷰의 프로필. 없으면 점검하지 않는다(서버가 다시 점검) */
  profile: Profile | undefined;
  /** 기간 화면에서 정한 일정 */
  events: Slot[];
  onCreate: (overrides: MenuClassOverride[]) => void;
  /** "외식 메뉴 고치기" (B16 T12-3). 사용자가 바꾼 분류를 반영한 지금 분류를 넘긴다 */
  onEditMenus?: (classes: MenuClassification[]) => void;
}) {
  const key = draftKey('menuClasses', conversationId);
  const [chosen, setChosen] = useState<Record<string, MenuClass>>(() => load(key));
  useEffect(() => save(key, chosen), [key, chosen]);

  const classOf = (c: MenuClassification): MenuClass => chosen[c.menu] ?? c.class;
  const overrides = classes.filter((c) => classOf(c) !== c.class).map((c) => ({ menu: c.menu, class: classOf(c) }));
  const current = useMemo(() => applyClassOverrides(classes, overrides), [classes, JSON.stringify(overrides)]);
  const usable = classes.length === 0 || classes.some((c) => classOf(c) !== 'avoid');
  // 바꾼 분류와 일정으로 규칙을 지키는 식단표가 없으면 만들기를 막는다(서버도 같은 점검으로 LLM 전에 막는다)
  const infeasible = usable && profile ? classStepWarning(profile, current, events) : undefined;
  // 끼니별 묶음과 해결 방법 (B16 T12-2)
  const view = useMemo(() => classGroupsView(profile, current, events), [profile, current, events]);
  const choose = (menu: string, value: MenuClass) => setChosen((prev) => ({ ...prev, [menu]: value }));
  const editMenus = onEditMenus && (() => onEditMenus(current));

  const row = (c: MenuClassification, group: string) => {
    const value = classOf(c);
    const changed = value !== c.class;
    return (
      <li key={`${group}-${c.menu}`} className={`class-row${changed ? ' changed' : ''}`}>
        <fieldset>
          <legend className="class-menu">
            {c.menu}
            {changed && <span className="changed-badge">바꿈</span>}
          </legend>
          <div className="class-options">
            {MENU_CLASSES.map((option) => (
              <label key={option} className={`class-option ${option}`}>
                <input
                  type="radio"
                  name={`class-${group}-${c.menu}`}
                  value={option}
                  checked={value === option}
                  onChange={() => choose(c.menu, option)}
                />
                <span>
                  {MENU_CLASS_LABELS[option]}
                  <small>{MENU_CLASS_HINTS[option]}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="class-detail">
            <p>{changed ? `처음 분류: ${MENU_CLASS_LABELS[c.class]}. ${c.reason}` : c.reason}</p>
            {c.criterionIds.length > 0 && (
              <p className="class-criteria">근거: {c.criterionIds.map((id) => CRITERION_LABELS[id]).join(', ')}</p>
            )}
            {c.orderTips.length > 0 && value !== 'avoid' && <p className="tip">주문 팁: {c.orderTips.join(', ')}</p>}
          </div>
        </fieldset>
      </li>
    );
  };
  const byMenu = (menu: string) => classes.find((c) => c.menu === menu)!;

  return (
    <section className="menu-classes">
      <div className="step">
        <h1 className="display">외식 메뉴 분류</h1>
        <p className="lede">
          {classes.length === 0
            ? '외식하는 끼니가 없어서 분류할 메뉴가 없어요. 바로 식단표를 만들 수 있어요.'
            : '식단 기준에 맞춰 메뉴를 나눴어요. 다르게 생각하는 메뉴는 바꿔 주세요. 식단표는 이 분류대로 메뉴를 고르고 횟수를 점검해요.'}
        </p>
        {view.summary && usable && (
          <p className="chat-alert" role="alert">
            {view.summary}
          </p>
        )}
      </div>

      {view.groups.map((g) => (
        <section key={g.key} className={`class-group${g.short ? ' short' : ''}`} aria-label={g.title}>
          <h2 className="class-group-title">
            {g.title}
            {g.short && <span className="short-badge">메뉴가 모자라요</span>}
          </h2>
          {g.short && (g.fixes.length > 0 || g.addMenu) && (
            <div className="fix-box">
              <p className="fix-title">이렇게 하면 만들 수 있어요 (하나만 하면 돼요)</p>
              <ul className="fix-list">
                {g.fixes.map((f) => (
                  <li key={f.menu}>
                    <button type="button" className="link" onClick={() => choose(f.menu, 'often')}>
                      {f.text}
                    </button>
                  </li>
                ))}
                {g.addMenu && (
                  <li>
                    {editMenus ? (
                      <button type="button" className="link" onClick={editMenus}>
                        {g.addMenu}
                      </button>
                    ) : (
                      g.addMenu
                    )}
                  </li>
                )}
              </ul>
            </div>
          )}
          <ul className="class-list">{g.menus.map((m) => row(byMenu(m), g.key))}</ul>
        </section>
      ))}

      {view.others.length > 0 && <ul className="class-list">{view.others.map((m) => row(byMenu(m), 'other'))}</ul>}

      <div className="interview-foot class-foot">
        {!usable && (
          <p className="chat-alert" role="alert">
            모든 메뉴를 피하면 외식 끼니에 넣을 메뉴가 없어요. 하나 이상은 다른 분류로 바꿔 주세요.
          </p>
        )}
        {infeasible && (
          <p className="chat-alert" role="alert">
            {infeasible} 위에 표시한 끼니의 방법 중 하나를 고르거나 "외식 메뉴 고치기"로 메뉴를 더 넣어 주세요.
          </p>
        )}
        <div className="choices">
          <button type="button" className="primary" disabled={!usable || !!infeasible} onClick={() => onCreate(overrides)}>
            이 분류로 식단표 만들기
          </button>
          {editMenus && classes.length > 0 && (
            <button type="button" className="secondary" onClick={editMenus}>
              외식 메뉴 고치기
            </button>
          )}
        </div>
        <p className="status-line">
          만드는 데 1~2분쯤 걸려요.
          {editMenus && classes.length > 0 && ' 외식 메뉴 고치기는 프로필 확인 화면으로 돌아가고, 지금 분류는 그대로 이어서 써요.'}
        </p>
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
