// 프로필 확인 화면 (스펙 7장, tasks.md B6 T5-2). 인터뷰 단계가 끝나면 제출 전에 보여 준다.
// 프로필 표, 식단 기준, 항목별 "고치기"(그 단계만 다시 묻는다), 저장 동의. 동의는 선택이고, 동의하지 않으면 저장하지 않는다.
import { useId, useState } from 'react';
import { buildCriteria } from '../core/criteria.ts';
import { profileFromInterview, type InterviewResult } from '../core/interview.ts';
import { mealName } from '../core/interview-text.ts';
import {
  AVOID_TAG_LABELS,
  COMPANION_LABELS,
  GOAL_LABELS,
  MEDICATION_LABELS,
  PLACE_LABELS,
} from '../core/labels.ts';
import { menuTypoHint, similarMenus } from '../core/menu-typos.ts';
import { criteriaText, type ProfileSection } from '../core/profile-edit.ts';
import { profileStepHint } from '../core/plan-feasibility.ts';
import { needsMedication, validateProfile, type ProfileIssueCode } from '../core/profile-validation.ts';

const ISSUE_TEXT: Record<ProfileIssueCode, string> = {
  goals_empty: '목표를 하나 이상 골라 주세요.',
  goals_duplicate: '같은 목표가 두 번 들어 있어요.',
  meal_missing: '끼니 표에 빠진 끼니가 있어요.',
  meal_duplicate: '끼니 표에 같은 끼니가 두 번 있어요.',
  menus_required: '외식 끼니에 메뉴가 없어요.',
  medication_without_goal: '약 복용 답이 목표와 맞지 않아요.',
  consent_missing: '',
};

export function ProfileConfirmView({
  result,
  defaultConsent,
  onEdit,
  onSubmit,
}: {
  result: InterviewResult;
  /** 저장한 프로필로 시작했으면 처음부터 체크 */
  defaultConsent: boolean;
  onEdit: (section: ProfileSection) => void;
  onSubmit: (consent: boolean) => void;
}) {
  const [consent, setConsent] = useState(defaultConsent);
  const consentId = useId();
  const { criteria, limits } = criteriaText(buildCriteria(result.goals));
  const profile = profileFromInterview(result, new Date());
  const issues = validateProfile(profile).filter((i) => i.code !== 'consent_missing');
  // 외식 메뉴가 적어 식단표를 만들기 어려우면 미리 알린다(막지는 않음, B15 T11-4)
  const menuHint = issues.length === 0 ? profileStepHint(profile) : undefined;
  // 한 글자만 다른 외식 메뉴는 다른 메뉴로 취급되니 오타인지 알린다(막지는 않음, T22-5)
  const typoHint = menuTypoHint(similarMenus(result.meals));

  const edit = (section: ProfileSection, label: string) => (
    <button type="button" className="link" onClick={() => onEdit(section)} aria-label={`${label} 고치기`}>
      고치기
    </button>
  );

  return (
    <div className="step profile-confirm">
      <h2 className="step-title">이대로 식단을 짤까요? 다른 점이 있으면 고쳐 주세요.</h2>

      <dl className="profile-table">
        <div className="profile-row">
          <dt>목표</dt>
          <dd>
            {result.goals.map((g) => GOAL_LABELS[g]).join(', ')}
            {result.goalNote && <span className="profile-note">{result.goalNote}</span>}
          </dd>
          <dd className="profile-edit">{edit({ kind: 'goals' }, '목표')}</dd>
        </div>
        {needsMedication(result.goals) && (
          <div className="profile-row">
            <dt>관련 약</dt>
            <dd>{MEDICATION_LABELS[result.medication]}</dd>
            <dd className="profile-edit">{edit({ kind: 'medication' }, '관련 약')}</dd>
          </div>
        )}
        <div className="profile-row">
          <dt>피할 음식</dt>
          <dd>
            {result.avoid.length ? result.avoid.map((t) => AVOID_TAG_LABELS[t]).join(', ') : '없음'}
            {result.avoidNote && <span className="profile-note">{result.avoidNote}</span>}
          </dd>
          <dd className="profile-edit">{edit({ kind: 'avoid' }, '피할 음식')}</dd>
        </div>
      </dl>

      <div className="profile-meals">
        <div className="profile-meals-head">
          <h3 className="field-label">끼니</h3>
          {edit({ kind: 'meals' }, '끼니 표 전체')}
        </div>
        <ul className="meal-summary">
          {result.meals.map((m) => {
            const name = mealName(m);
            return (
              <li key={name} className={`meal-line ${m.place}`}>
                <span className="meal-line-name">{name}</span>
                <span>
                  {PLACE_LABELS[m.place]}
                  {m.place !== 'skip' && ` · ${COMPANION_LABELS[m.companions]}`}
                </span>
                {m.place === 'eat_out' && (
                  <span className="meal-line-detail">
                    {(m.menus ?? []).join(', ')} {edit({ kind: 'menus', meal: m }, `${name} 메뉴`)}
                  </span>
                )}
                {m.place === 'home' && (
                  <span className="meal-line-detail">
                    {m.cookMinutes === undefined ? '조리 시간 상관없음' : `조리 ${m.cookMinutes}분 안`}{' '}
                    {edit({ kind: 'cookMinutes', meal: m }, `${name} 조리 시간`)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="criteria-box">
        <h3 className="field-label">식단 기준</h3>
        <p>{criteria.join(' · ')}</p>
        {limits.length > 0 && <p className="criteria-limits">1주일 횟수: {limits.join(', ')}</p>}
        <p className="criteria-hint">목표로 정해지는 일반 식단 지침이에요. 의료 조언이 아니에요.</p>
      </div>

      {issues.length > 0 && (
        <ul className="chat-alert" role="alert">
          {issues.map((i, n) => (
            <li key={n}>{ISSUE_TEXT[i.code]}</li>
          ))}
        </ul>
      )}

      {menuHint && (
        <p className="chat-alert" role="status">
          {menuHint}
        </p>
      )}

      {typoHint && (
        <p className="chat-alert" role="status">
          {typoHint}
        </p>
      )}

      <label className="option consent" htmlFor={consentId}>
        <input id={consentId} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          다음에 다시 묻지 않도록 프로필을 저장할게요 (선택)
          <small>
            건강 목표와 피할 음식이 들어 있어요. 저장하면 같은 링크로 다른 기기에서도 불러올 수 있고, 만든 식단표도 함께 저장해요.
            저장하지 않아도 식단표를 만들 수 있어요. 어느 쪽이든 입력한 내용과 만든 식단표는 대화 기록으로 서버에 남고, 화면 아래 “내 기록 모두 지우기”로 언제든 지울 수 있어요.
          </small>
        </span>
      </label>

      <button type="button" className="primary" disabled={issues.length > 0} onClick={() => onSubmit(consent)}>
        이대로 진행
      </button>
    </div>
  );
}
