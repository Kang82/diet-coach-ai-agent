'use agent';
import { type AgentProps, useDelivery, useModel, usePersistentState, useResponseFinish, useTool } from '@flue/runtime';
import { EDIT_REQUEST_PREFIX } from '../core/edit-request.ts';
import type { InterviewResult } from '../core/interview.ts';
import { INTERVIEW_SUBMIT_PREFIX } from '../core/interview-form.ts';
import { SUBMISSION_DURABILITY } from '../core/llm-timeout.ts';
import { estimateNeurons } from '../core/neurons.ts';
import { CLASSIFY_REQUEST, PLAN_REQUEST_PREFIX } from '../core/plan-request.ts';
import type { PlanPeriod } from '../core/period.ts';
import type { MenuClassification, Plan } from '../core/types.ts';
import { CLASSIFY_TOOL, classifyMenusTool } from './classify-menus-tool.ts';
import { CREATE_PLAN_TOOL, createWeekPlanTool } from './create-plan-tool.ts';
import { EDIT_PLAN_TOOL, editPlanCellsTool } from './edit-plan-tool.ts';
import { INTERVIEW_TOOL, submitInterviewTool } from './interview-tool.ts';
import { DEFAULT_MODEL, INTERVIEW_THINKING, NEURON_PRICES } from './models.ts';
import { usageMeter } from './usage-meter.ts';
import { userIdFromConversation } from '../core/profile-store.ts';
import type { UserStore } from './plan-tool-support.ts';
import { agentStorage } from './storage-binding.ts';

// 인터뷰는 화면에서 진행하고 끝나면 제출 메시지를 한 번 보낸다 (tasks.md B4).
// 인터뷰가 끝나기 전에는 submit_interview만, 끝난 뒤에는 메뉴 분류·식단표 도구를 마운트한다.
// 어느 도구를 부를지는 화면이 보낸 메시지의 접두어로 정해 모델이 판단할 일이 거의 없게 한다.
// 식단표는 끝난 인터뷰와 확인된 메뉴 분류로 만든다 (tasks.md B5).
export function DietCoach({ id }: AgentProps) {
  const delivery = useDelivery();
  // 서버 저장(T6-2): 대화 ID "<userId>-…"의 사용자. 한도 보호 미들웨어가 접두어를 확인했다
  const store = userStoreFor(id);

  // 끝난 인터뷰 (스펙 4.1). 진행 중 상태는 화면이 들고 있다
  const [interviewResult, setInterviewResult] = usePersistentState<InterviewResult>('interviewResult');

  // 지금 식단표. 만들기가 저장하고 칸 수정이 고친다. 도구는 이전 도구 결과를 읽을 수 없어서 상태로 들고 있는다.
  const [plan, setPlan] = usePersistentState<Plan>('plan');

  // 메뉴 분류 (스펙 4.2). classify_menus가 저장하고, 식단표를 만들 때 사용자가 바꾼 분류로 다시 저장한다. 칸 수정도 이 값으로 점검한다
  const [menuClasses, setMenuClasses] = usePersistentState<MenuClassification[]>('menuClasses');

  // 기간과 일정 (B6). classify_menus가 요청 메시지의 일정을 검증해 저장하고, 식단표를 만들 때 쓴다
  const [period, setPeriod] = usePersistentState<PlanPeriod>('period');

  const interviewing = interviewResult === undefined;
  // 인터뷰 중 바깥 턴은 도구를 부르기만 하면 되므로 추론을 줄인다. 식단표 단계는 Flue 기본값('medium') 그대로
  useModel(DEFAULT_MODEL, interviewing ? { thinkingLevel: INTERVIEW_THINKING } : undefined);
  if (interviewing) {
    useTool(submitInterviewTool({ saveResult: setInterviewResult, delivery, meter: usageMeter, store }));
  } else {
    useTool(
      classifyMenusTool({ interviewResult, saveClasses: setMenuClasses, savePeriod: setPeriod, delivery, meter: usageMeter }),
    );
    useTool(
      createWeekPlanTool({
        interviewResult,
        menuClasses,
        period,
        saveClasses: setMenuClasses,
        savePlan: setPlan,
        delivery,
        meter: usageMeter,
        store,
      }),
    );
    useTool(
      editPlanCellsTool({ interviewResult, menuClasses, plan, savePlan: setPlan, delivery, meter: usageMeter, store }),
    );
  }

  // 응답 하나의 사용량을 응답 metadata와 로그로 남기고 전체 안전선 카운터에 더한다 (스펙 11.4-3).
  // 도구 안 harness.prompt 사용량은 여기 들어가지 않고 도구가 따로 더한다 (스펙 11.5, B1, metered-harness.ts).
  // 콜백이 동기라 기록은 기다리지 않는다. Durable Object는 응답 뒤에도 살아 있어 끝까지 쓴다.
  useResponseFinish(({ response, log }) => {
    const { input, output } = response.usage;
    const exact = estimateNeurons({ model: DEFAULT_MODEL, input, output }, NEURON_PRICES);
    const neurons = Math.round(exact);
    log.info('응답 사용량', { input, output, neurons });
    usageMeter.add(exact).catch((error: unknown) => {
      log.warn('사용량 기록 실패', { message: error instanceof Error ? error.message : String(error) });
    });
    return { usage: { model: DEFAULT_MODEL, input, output, neurons } };
  });

  const intro = [
    '당신은 바쁜 직장인의 식단 코치입니다.',
    '일반적인 식단 지침을 따르며, 의료 조언은 하지 않습니다.',
    // 도구는 실패도 결과로 답하고 턴을 끝내지만(리뷰 1번), 모델이 같은 도구를 다시 부르지 않게 한 번 더 적는다
    '도구 결과가 실패여도 같은 도구를 다시 부르지 마세요. 사용자가 화면에서 다시 시도합니다.',
  ];
  if (interviewing) {
    return [
      ...intro,
      `지금은 인터뷰 중입니다. 사용자 메시지가 "${INTERVIEW_SUBMIT_PREFIX}"로 시작하면 ${INTERVIEW_TOOL} 도구를 한 번 부르세요. 답은 도구가 메시지에서 직접 읽으므로 입력은 비워 두세요.`,
      '그 밖의 메시지에는 화면에서 인터뷰를 마쳐 달라고 한 문장으로만 답하세요. 도구가 실패해도 직접 질문하거나 답하지 말고 그대로 끝내세요.',
    ].join('\n');
  }
  return [
    ...intro,
    `사용자 메시지가 "${EDIT_REQUEST_PREFIX}"로 시작하면 ${EDIT_PLAN_TOOL} 도구를 한 번 부르세요. 칸과 요청은 도구가 메시지에서 직접 읽으므로 입력은 비워 두세요.`,
    `사용자 메시지가 "${CLASSIFY_REQUEST}"로 시작하면 ${CLASSIFY_TOOL} 도구를 한 번 부르세요. 메뉴와 일정은 도구가 직접 읽으므로 입력은 비워 두세요.`,
    `사용자 메시지가 "${PLAN_REQUEST_PREFIX}"로 시작하거나 식단표를 만들어 달라고 하면 ${CREATE_PLAN_TOOL} 도구를 한 번 부르세요. 바꾼 분류는 도구가 메시지에서 직접 읽으므로 입력은 비워 두세요.`,
  ].join('\n');
}

// 제출 하나의 복구 한도: 3회, 20분 (B12, core/llm-timeout.ts). Flue 기본(10회·1시간)이면 복구가 되풀이될 때 Neuron을 많이 쓴다
DietCoach.durability = { ...SUBMISSION_DURABILITY };

/** 사용자 ID를 알 수 있는 대화(웹 화면, 평가 세트)만 서버에 저장한다 */
function userStoreFor(conversationId: string): UserStore | undefined {
  try {
    return { storage: agentStorage(), userId: userIdFromConversation(conversationId) };
  } catch {
    return undefined;
  }
}
