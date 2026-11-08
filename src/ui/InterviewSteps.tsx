// 인터뷰 단계별 입력 (스펙 4.1, tasks.md B4). 각 단계는 입력을 InterviewUpdate로 바꿔 onAnswer로 넘긴다.
// update를 만드는 일은 core/interview-form.ts가 한다. 여기서는 입력 모양만 다룬다.
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  avoidUpdate,
  cookMinutesUpdate,
  goalsUpdate,
  mealsUpdate,
  medicationUpdate,
  menusUpdate,
  type MealRow,
} from '../core/interview-form.ts';
import { mealName } from '../core/interview-text.ts';
import type { StepDefaults } from './interview-form-state.ts';
import { AVOID_TAG_LABELS, COMPANION_LABELS, GOAL_LABELS, MEDICATION_LABELS, PLACE_LABELS } from '../core/labels.ts';
import { MEAL_KEYS } from '../core/helpers.ts';
import { AVOID_TAGS, GOAL_IDS } from '../core/types.ts';
import type {
  AvoidTag,
  DraftMealSetting,
  GoalId,
  InterviewDraft,
  InterviewUpdate,
  MealKey,
  MealPlace,
  MealSetting,
  Medication,
  StopFlag,
} from '../core/types.ts';

type OnAnswer = (update: InterviewUpdate) => void;

const STOP_CHOICES: { flag: StopFlag; label: string }[] = [
  { flag: 'pregnancy', label: '임신 중이거나 임신 가능성이 있어요' },
  { flag: 'kidney_disease', label: '신장 질환이 있어요' },
];

const MEDICATIONS: Medication[] = ['none', 'glucose', 'cholesterol', 'other'];
const PLACES: MealPlace[] = ['skip', 'eat_out', 'home'];
const COMPANIONS: MealSetting['companions'][] = ['alone', 'family', 'others'];
const COOK_MINUTES = [10, 20, 30, 45, 60];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** defaults: "고치기"로 다시 물을 때 이전 답 (T16, interview-form-state.ts stepDefaults) */
export function GoalsStep({
  draft,
  choices,
  defaults = {},
  onAnswer,
}: {
  draft: InterviewDraft;
  choices?: string[];
  defaults?: StepDefaults;
  onAnswer: OnAnswer;
}) {
  const [goals, setGoals] = useState<GoalId[]>(draft.goals ?? defaults.goals ?? []);
  const [note, setNote] = useState(draft.goalNote ?? defaults.goalNote ?? '');
  const [stops, setStops] = useState<StopFlag[]>([]);
  const noteId = useId();

  /** 지원 목표 이름이면 그 목표를 고르고, 아니면(무리하지 않는 목표 제안) 메모를 바꾼다 */
  function pick(choice: string) {
    const goal = GOAL_IDS.find((g) => GOAL_LABELS[g] === choice);
    if (goal) setGoals((prev) => (prev.includes(goal) ? prev : [...prev, goal]));
    else setNote(choice);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onAnswer(goalsUpdate({ goals, goalNote: note, stopFlags: stops }));
  }

  return (
    <form className="step-form" onSubmit={submit}>
      {choices && choices.length > 0 && (
        <div className="choices" role="group" aria-label="추천">
          {choices.map((c) => (
            <button key={c} type="button" className="secondary" onClick={() => pick(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <fieldset>
        <legend>목표 (여러 개 고를 수 있어요)</legend>
        {GOAL_IDS.map((g) => (
          <label key={g} className="option">
            <input type="checkbox" checked={goals.includes(g)} onChange={() => setGoals((prev) => toggle(prev, g))} />
            {GOAL_LABELS[g]}
          </label>
        ))}
      </fieldset>
      <label htmlFor={noteId} className="field-label">
        더 적고 싶은 내용 (선택)
      </label>
      <textarea
        id={noteId}
        rows={2}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 3개월에 5kg 감량, 건강검진에서 콜레스테롤이 높다고 들었어요"
      />
      <fieldset>
        <legend>해당하면 골라 주세요</legend>
        {STOP_CHOICES.map(({ flag, label }) => (
          <label key={flag} className="option">
            <input type="checkbox" checked={stops.includes(flag)} onChange={() => setStops((prev) => toggle(prev, flag))} />
            {label}
          </label>
        ))}
      </fieldset>
      <button type="submit" className="primary" disabled={goals.length === 0}>
        다음
      </button>
    </form>
  );
}

export function MedicationStep({ defaults = {}, onAnswer }: { defaults?: StepDefaults; onAnswer: OnAnswer }) {
  return (
    <div className="choices" role="group" aria-label="약">
      {MEDICATIONS.map((m) => (
        <ChoiceButton key={m} current={defaults.medication === m} onClick={() => onAnswer(medicationUpdate(m))}>
          {MEDICATION_LABELS[m]}
        </ChoiceButton>
      ))}
    </div>
  );
}

/** 한 번 눌러 답하는 선택지. current: 고치기 전 답 (T16). 누르는 동작은 같고 "지금 답" 표시만 한다 */
function ChoiceButton({ current, onClick, children }: { current: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={current ? 'secondary current' : 'secondary'} aria-pressed={current} onClick={onClick}>
      {children}
      {current && <span className="current-mark"> · 지금 답</span>}
    </button>
  );
}

export function AvoidStep({ defaults = {}, onAnswer }: { defaults?: StepDefaults; onAnswer: OnAnswer }) {
  const [avoid, setAvoid] = useState<AvoidTag[]>(defaults.avoid ?? []);
  // 이전 답이 "없음"([])이었으면 없음에 체크해 둔다
  const [none, setNone] = useState(defaults.avoid?.length === 0);
  const [note, setNote] = useState(defaults.avoidNote ?? '');
  const noteId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    onAnswer(avoidUpdate({ avoid: none ? [] : avoid, avoidNote: note }));
  }

  return (
    <form className="step-form" onSubmit={submit}>
      <fieldset>
        <legend>피할 음식</legend>
        <label className="option">
          <input
            type="checkbox"
            checked={none}
            onChange={() => {
              setNone((v) => !v);
              setAvoid([]);
            }}
          />
          없음
        </label>
        <div className="option-grid">
          {AVOID_TAGS.map((t) => (
            <label key={t} className="option">
              <input
                type="checkbox"
                checked={avoid.includes(t)}
                onChange={() => {
                  setNone(false);
                  setAvoid((prev) => toggle(prev, t));
                }}
              />
              {AVOID_TAG_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={noteId} className="field-label">
        이유나 더 적고 싶은 내용 (선택)
      </label>
      <textarea
        id={noteId}
        rows={2}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 우유를 마시면 배가 아파요"
      />
      <button type="submit" className="primary" disabled={!none && avoid.length === 0}>
        다음
      </button>
    </form>
  );
}

type RowInput = { place?: MealPlace; companions: MealSetting['companions'] };

export function MealsStep({ defaults = {}, onAnswer }: { defaults?: StepDefaults; onAnswer: OnAnswer }) {
  const [rows, setRows] = useState<RowInput[]>(
    MEAL_KEYS.map((k) => {
      const before = defaults.meals?.find((m) => m.dayType === k.dayType && m.meal === k.meal);
      return before ? { place: before.place, companions: before.companions } : { companions: 'alone' };
    }),
  );
  const done = rows.every((r) => r.place);

  function update(i: number, patch: Partial<RowInput>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const meals: MealRow[] = MEAL_KEYS.map((k, i) => ({ ...k, place: rows[i]!.place!, companions: rows[i]!.companions }));
    onAnswer(mealsUpdate(meals));
  }

  return (
    <form className="step-form" onSubmit={submit}>
      <div className="meal-rows">
        {MEAL_KEYS.map((key, i) => {
          const row = rows[i]!;
          return (
            <fieldset key={`${key.dayType}-${key.meal}`} className="meal-row">
              <legend>{mealName(key)}</legend>
              <div className="segmented">
                {PLACES.map((p) => (
                  <label key={p} className="option">
                    <input type="radio" name={`place-${i}`} checked={row.place === p} onChange={() => update(i, { place: p })} />
                    {PLACE_LABELS[p]}
                  </label>
                ))}
              </div>
              <label className="companions">
                <span className="visually-hidden">{mealName(key)} 같이 먹는 사람</span>
                <select
                  value={row.companions}
                  disabled={row.place === undefined || row.place === 'skip'}
                  onChange={(e) => update(i, { companions: e.target.value as MealSetting['companions'] })}
                >
                  {COMPANIONS.map((c) => (
                    <option key={c} value={c}>
                      {COMPANION_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          );
        })}
      </div>
      <button type="submit" className="primary" disabled={!done}>
        다음
      </button>
    </form>
  );
}

export function MenusStep({
  mealKey,
  existing,
  followUp,
  initialText = '',
  onAnswer,
}: {
  mealKey: MealKey;
  existing: DraftMealSetting | undefined;
  /** 메뉴가 적어 한 번 더 묻는 중 (분기 6) */
  followUp: boolean;
  /** "고치기"로 다시 물을 때 이전 메뉴 (B16, T16 stepDefaults.menusText) */
  initialText?: string;
  onAnswer: OnAnswer;
}) {
  const [text, setText] = useState(initialText);
  const inputId = useId();
  const known = existing?.menus ?? [];

  function submit(e: FormEvent) {
    e.preventDefault();
    onAnswer(menusUpdate(mealKey, text, followUp ? known : []));
  }

  return (
    <form className="step-form" onSubmit={submit}>
      {followUp && known.length > 0 && <p className="lede">지금까지 받은 메뉴: {known.join(', ')}</p>}
      <label htmlFor={inputId} className="field-label">
        {mealName(mealKey)} 메뉴
      </label>
      <textarea id={inputId} rows={2} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="국밥, 백반, 쌀국수" />
      <div className="choices">
        <button type="submit" className="primary" disabled={!text.trim()}>
          다음
        </button>
        {followUp && (
          <button type="button" className="secondary" onClick={() => onAnswer({ filled: {}, stopFlags: [], turnFlags: [] })}>
            더 없음
          </button>
        )}
      </div>
    </form>
  );
}

export function CookMinutesStep({
  mealKey,
  defaults = {},
  onAnswer,
}: {
  mealKey: MealKey;
  defaults?: StepDefaults;
  onAnswer: OnAnswer;
}) {
  return (
    <div className="choices" role="group" aria-label={`${mealName(mealKey)} 조리 시간`}>
      {COOK_MINUTES.map((m) => (
        <ChoiceButton key={m} current={defaults.cookMinutes === m} onClick={() => onAnswer(cookMinutesUpdate(mealKey, m))}>
          {m}분
        </ChoiceButton>
      ))}
      <ChoiceButton current={defaults.cookMinutes === null} onClick={() => onAnswer(cookMinutesUpdate(mealKey, null))}>
        상관없음
      </ChoiceButton>
    </div>
  );
}
