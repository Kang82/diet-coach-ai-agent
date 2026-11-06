// 평가 세트용: 식단표를 만들기 전 단계(인터뷰 제출, 메뉴 분류)를 대화에 채운다 (tasks.md B5).
// 인터뷰는 목표 메모를 비워 보내 LLM을 부르지 않는다. 메뉴 분류는 실제 모델을 부르지만(약 50 Neuron),
// 식단표 만들기 메시지에서 분류를 페르소나 픽스처 값으로 바꿔 보내 점검 기준이 회차마다 같게 한다.
import { formatInterviewSubmission } from '../../core/interview-form.ts';
import { applyClassOverrides, type MenuClassOverride } from '../../core/menu-classification.ts';
import type { ClassifyToolOutput } from '../../core/classify-tool-output.ts';
import type { InterviewToolOutput } from '../../core/interview-tool-output.ts';
import { CLASSIFY_REQUEST } from '../../core/plan-request.ts';
import type { InterviewDraft, MenuClassification, Profile } from '../../core/types.ts';
import { parseToolOutput, sendAndWait, toolParts, type ConversationResult } from './agent-http.ts';

export interface Prepared {
  conversationId: string;
  /** 식단표 만들기 메시지에 실을 분류 변경 */
  overrides: MenuClassOverride[];
  /** 도구가 식단표에 쓸 분류 (평가 쪽 checkPlan 기준) */
  classes: MenuClassification[];
  /** 한도 초과나 실패면 그 단계의 결과 */
  failed?: { step: string; res: ConversationResult; quota: boolean };
}

export async function prepareConversation(profile: Profile, fixtureClasses: MenuClassification[]): Promise<Prepared> {
  const submitted = await sendAndWait(formatInterviewSubmission({ draft: draftOf(profile), stopFlags: [] }), { pollMs: 2_000 });
  const conversationId = submitted.conversationId;
  const interview = parseToolOutput<InterviewToolOutput>(toolParts(submitted.snapshot, 'submit_interview').at(-1));
  if (interview?.status !== 'done') {
    return { conversationId, overrides: [], classes: [], failed: { step: '인터뷰', res: submitted, quota: interview?.status === 'quota' } };
  }

  const classified = await sendAndWait(CLASSIFY_REQUEST, { conversationId, pollMs: 2_000 });
  const out = parseToolOutput<ClassifyToolOutput>(toolParts(classified.snapshot, 'classify_menus').at(-1));
  if (out?.status !== 'ok') {
    return { conversationId, overrides: [], classes: [], failed: { step: '메뉴 분류', res: classified, quota: out?.status === 'quota' } };
  }

  const overrides = fixtureClasses.map(({ menu, class: c }) => ({ menu, class: c }));
  return { conversationId, overrides, classes: applyClassOverrides(out.classes, overrides) };
}

/** 프로필을 인터뷰 화면이 보내는 초안 모양으로. 목표 메모는 비운다(LLM 확인을 건너뜀) */
function draftOf(profile: Profile): InterviewDraft {
  return {
    goals: [...profile.goals],
    goalNote: '',
    medication: profile.medication,
    avoid: [...profile.avoid],
    avoidNote: profile.avoidNote,
    meals: profile.meals.map((m) => ({
      ...structuredClone(m),
      cookMinutes: m.place === 'home' ? (m.cookMinutes ?? null) : undefined,
    })),
  };
}
