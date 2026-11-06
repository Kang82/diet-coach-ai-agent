// 스펙 4.1 인터뷰의 valibot 스키마 (tasks.md B4).
// - InterviewSubmissionSchema: 화면이 보낸 제출 메시지(core/interview-form.ts)의 JSON 검사
// - GoalNoteCheckSchema: 목표 메모 확인 LLM 출력(Flue finish 도구의 인자)
// 형식만 본다. 인터뷰가 끝났는지, 다음에 무엇을 할지는 applyTurn이 정한다.
import * as v from 'valibot';
import type { GoalNoteCheck } from '../core/interview-note.ts';
import type { InterviewSubmission } from '../core/interview-form.ts';
import type { DraftMealSetting, InterviewDraft } from '../core/types.ts';
import { AVOID_TAGS, GOAL_IDS, MEAL_TYPES, STOP_FLAGS } from '../core/types.ts';

const TURN_FLAGS = ['extreme_restriction', 'unsupported_goal', 'asks_lab_interpretation', 'asks_medication_advice'] as const;

const DraftMealSchema = v.strictObject({
  dayType: v.picklist(['weekday', 'weekend']),
  meal: v.picklist(MEAL_TYPES),
  place: v.optional(v.picklist(['skip', 'eat_out', 'home'])),
  companions: v.optional(v.picklist(['alone', 'family', 'others'])),
  menus: v.optional(v.array(v.pipe(v.string(), v.maxLength(100)))),
  /** null은 "상관없다" */
  cookMinutes: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(600)))),
});

const DraftSchema = v.strictObject({
  goals: v.optional(v.array(v.picklist(GOAL_IDS))),
  goalNote: v.optional(v.pipe(v.string(), v.maxLength(500))),
  medication: v.optional(v.picklist(['none', 'glucose', 'cholesterol', 'other'])),
  avoid: v.optional(v.array(v.picklist(AVOID_TAGS))),
  avoidNote: v.optional(v.pipe(v.string(), v.maxLength(500))),
  meals: v.optional(v.pipe(v.array(DraftMealSchema), v.maxLength(6))),
});

export const InterviewSubmissionSchema = v.strictObject({
  draft: DraftSchema,
  stopFlags: v.array(v.picklist(STOP_FLAGS)),
  consent: v.optional(v.boolean()),
});

/** 형식이 틀리면 undefined */
export function parseInterviewSubmission(json: unknown): InterviewSubmission | undefined {
  const res = v.safeParse(InterviewSubmissionSchema, json);
  if (!res.success) return undefined;
  const { draft, stopFlags, consent } = res.output;
  return {
    draft: draft as InterviewDraft & { meals?: DraftMealSetting[] },
    stopFlags: [...stopFlags],
    ...(consent ? { consent: true } : {}),
  };
}

// 모델이 빈 값을 null로 내는 경우가 많아 nullish로 받고 빈 배열로 바꾼다.
// 스키마 검증에 실패하면 Flue가 다시 요청해 Neuron을 더 쓰므로 받아 줄 수 있는 모양은 받는다.
export const GoalNoteCheckSchema = v.object({
  stopFlags: v.nullish(v.array(v.picklist(STOP_FLAGS))),
  turnFlags: v.nullish(v.array(v.picklist(TURN_FLAGS))),
  choices: v.nullish(v.array(v.string())),
});

export type GoalNoteCheckOutput = v.InferOutput<typeof GoalNoteCheckSchema>;

export function toGoalNoteCheck(raw: GoalNoteCheckOutput): GoalNoteCheck {
  return {
    stopFlags: [...(raw.stopFlags ?? [])],
    turnFlags: [...(raw.turnFlags ?? [])],
    choices: (raw.choices ?? []).map((c) => c.trim()).filter(Boolean),
  };
}
