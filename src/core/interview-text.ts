// 인터뷰 문장 (스펙 4.1, tasks.md B4). 단계 제목, 다시 묻는 이유, 중단·범위 밖 안내, 끝 요약은 코드 템플릿으로 만든다.
// 인터뷰는 화면 입력으로 받는다(interview-form.ts). 문구는 버튼과 입력칸 위에 보이는 것을 전제로 쓴다.
import type { InterviewResult } from './interview.ts';
import type { OutOfScopeNotice, TurnNext } from './interview-turn.ts';
import {
  AVOID_TAG_LABELS,
  COMPANION_LABELS,
  DAY_TYPE_LABELS,
  GOAL_LABELS,
  MEAL_LABELS,
  MEDICATION_LABELS,
  PLACE_LABELS,
} from './labels.ts';
import { needsMedication } from './profile-validation.ts';
import type { InterviewField, MealKey, StopFlag } from './types.ts';

/** 화면에 보여 줄 코치 말 하나 */
export interface InterviewMessage {
  /** 줄바꿈(\n)으로 문장을 나눈다 */
  text: string;
  choices?: string[];
}

export function mealName(key: MealKey): string {
  return `${DAY_TYPE_LABELS[key.dayType]} ${MEAL_LABELS[key.meal]}`;
}

export function questionText(field: InterviewField): string {
  if (typeof field === 'object') {
    if ('menusFor' in field) {
      return `${mealName(field.menusFor)}에 자주 먹는 식당 메뉴를 쉼표로 나눠 적어 주세요. 예: 국밥, 백반, 쌀국수`;
    }
    return `${mealName(field.cookMinutesFor)} 집밥은 조리에 몇 분까지 쓸 수 있나요?`;
  }
  switch (field) {
    case 'goals':
      return '어떤 목표로 식단을 관리하고 싶으세요? 지금은 체중 감량, 혈당 관리, 콜레스테롤 관리를 도와 드려요.';
    case 'medication':
      return '혈당이나 콜레스테롤 때문에 드시는 약이 있나요?';
    case 'avoid':
      return '피해야 하거나 먹지 않는 음식이 있나요? 없으면 "없음"을 골라 주세요.';
    case 'meals':
      return '평일과 주말의 아침·점심·저녁을 보통 어떻게 드세요? 끼니마다 안 먹음·외식·집밥과 같이 먹는 사람을 골라 주세요.';
  }
}

const STOP_TEXT: Record<StopFlag, string> = {
  pregnancy: '임신 중이거나 임신 가능성이 있으면 일반 식단 지침으로 식단을 짜기 어려워요.',
  kidney_disease: '신장 질환이 있으면 단백질이나 나트륨 같은 제한이 사람마다 달라서 일반 지침으로 짜기 어려워요.',
  glucose_medication: '혈당약을 드시면 식사량을 바꿀 때 저혈당이 올 수 있어요.',
};
const STOP_CLOSING = '의사나 영양사와 먼저 상담해 주세요. 이 대화에서는 식단표를 만들지 않아요.';

const NOTICE_TEXT: Record<OutOfScopeNotice, string> = {
  asks_lab_interpretation: '검사 수치 해석은 도와 드릴 수 없어요. 담당 의사에게 물어봐 주세요.',
  asks_medication_advice: '약에 관한 질문은 도와 드릴 수 없어요. 의사나 약사에게 물어봐 주세요.',
};

const DONE_TEXT = '이제 식단을 짤 준비가 됐어요. 아래 내용이 맞는지 확인해 주세요.';

/** applyTurn 결과를 코치 말로 바꾼다 */
export function formatTurnReply(next: TurnNext, notices: OutOfScopeNotice[]): InterviewMessage {
  const lines: string[] = notices.map((n) => NOTICE_TEXT[n]);

  switch (next.kind) {
    case 'stop':
      lines.push(...next.flags.map((f) => STOP_TEXT[f]), STOP_CLOSING);
      return { text: lines.join('\n') };
    case 'done':
      lines.push(DONE_TEXT);
      return { text: lines.join('\n') };
    case 'ask': {
      lines.push(askText(next.field, next.reason));
      return { text: lines.join('\n'), ...(next.choices?.length ? { choices: [...next.choices] } : {}) };
    }
  }
}

function askText(field: InterviewField, reason: Extract<TurnNext, { kind: 'ask' }>['reason']): string {
  switch (reason) {
    case undefined:
      return questionText(field);
    case 'extreme_restriction':
      return `너무 급하게 줄이는 목표는 몸에 무리가 갈 수 있어서 그대로 따르기 어려워요. 무리하지 않는 목표로 메모를 고쳐 주세요. ${questionText(field)}`;
    case 'unsupported_goal':
      return `메모에 적은 목표는 아직 도와 드리지 못해요. 아래 목표 중에서 고르고 메모를 고쳐 주세요. ${questionText(field)}`;
    case 'ambiguous':
      return `답을 하나로 정하기 어려워요. 가까운 것을 골라 주세요. ${questionText(field)}`;
    case 'few_menus': {
      const key = typeof field === 'object' && 'menusFor' in field ? field.menusFor : undefined;
      const where = key ? `${mealName(key)} ` : '';
      return `메뉴가 적으면 같은 메뉴가 자주 나와요. ${where}메뉴를 더 알려 주실 수 있나요? 없으면 "더 없음"을 눌러 주세요. 주문 방법을 바꿔 가며 짜 볼게요.`;
    }
  }
}

/** 인터뷰 결과 요약 줄. 프로필 확인 화면(T5-2)이 생기기 전까지 끝 화면에 보여 준다. */
export function summarizeInterviewResult(result: InterviewResult): string[] {
  const lines = [
    withNote(`목표: ${result.goals.map((g) => GOAL_LABELS[g]).join(', ')}`, result.goalNote),
  ];
  if (needsMedication(result.goals)) lines.push(`관련 약: ${MEDICATION_LABELS[result.medication]}`);
  const avoid = result.avoid.length ? result.avoid.map((t) => AVOID_TAG_LABELS[t]).join(', ') : '없음';
  lines.push(withNote(`피할 음식: ${avoid}`, result.avoidNote));

  for (const m of result.meals) {
    const head = `${mealName(m)}: ${PLACE_LABELS[m.place]}`;
    if (m.place === 'skip') lines.push(head);
    else if (m.place === 'eat_out') lines.push(`${head}, ${COMPANION_LABELS[m.companions]} · ${(m.menus ?? []).join(', ')}`);
    else {
      const time = m.cookMinutes === undefined ? '조리 시간 상관없음' : `${m.cookMinutes}분 안`;
      lines.push(`${head}, ${COMPANION_LABELS[m.companions]} · ${time}`);
    }
  }
  return lines;
}

function withNote(line: string, note: string): string {
  return note.trim() ? `${line} (${note.trim()})` : line;
}
