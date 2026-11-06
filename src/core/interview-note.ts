// 목표 메모 확인 (스펙 4.1, tasks.md B4). 인터뷰에서 LLM을 부르는 곳은 여기 하나다.
// 사용자가 자유롭게 쓴 목표 메모에서 중단 사유, 무리한 목표, 지원하지 않는 목표, 범위 밖 질문을 찾는다.
// 입력 토큰을 줄이려고 프롬프트를 짧게 둔다 (턴마다 추출하던 방식은 1회 약 150~240 Neuron이었다).
import { GOAL_LABELS } from './labels.ts';
import type { GoalId, InterviewUpdate, StopFlag, TurnFlag } from './types.ts';

export interface GoalNoteInput {
  goals: GoalId[];
  note: string;
}

export interface GoalNoteCheck {
  stopFlags: StopFlag[];
  turnFlags: TurnFlag[];
  /** extreme_restriction일 때 무리하지 않는 목표 선택지 */
  choices: string[];
}

export function buildGoalNotePrompt({ goals, note }: GoalNoteInput): string {
  return [
    '식단 코치 앱 사용자가 쓴 목표 메모를 분류하세요. 해당하는 값만 넣고, 없으면 빈 배열로 두세요.',
    `고른 목표: ${goals.map((g) => GOAL_LABELS[g]).join(', ')}`,
    `메모: ${JSON.stringify(note)}`,
    'stopFlags: pregnancy(임신 중이거나 가능성), kidney_disease(신장 질환), glucose_medication(혈당약 복용)',
    'turnFlags: extreme_restriction(한 달에 5kg 넘게 감량, 굶기, 하루 한 끼처럼 무리한 제한), unsupported_goal(근육 증가 등 체중 감량·혈당·콜레스테롤 관리가 아닌 목표), asks_lab_interpretation(검사 수치 해석 요청), asks_medication_advice(약에 관한 질문)',
    'choices: extreme_restriction일 때만, 무리하지 않는 목표 2~3개를 짧은 한국어로 (예: "한 달에 2kg 감량")',
  ].join('\n');
}

/** 확인 결과를 applyTurn에 넣을 update로. 선택지는 무리한 목표일 때만 ambiguous로 넘긴다(분기 2가 쓴다) */
export function goalNoteUpdate(check: GoalNoteCheck): InterviewUpdate {
  const update: InterviewUpdate = { filled: {}, stopFlags: [...check.stopFlags], turnFlags: [...check.turnFlags] };
  if (check.turnFlags.includes('extreme_restriction') && check.choices.length > 0) {
    update.ambiguous = { field: 'goals', choices: [...check.choices] };
  }
  return update;
}
