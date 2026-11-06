'use agent';
import { useDelivery, useModel, usePersistentState, useResponseFinish, useTool } from '@flue/runtime';
import { EDIT_REQUEST_PREFIX } from '../core/edit-request.ts';
import { estimateNeurons } from '../core/neurons.ts';
import type { Plan } from '../core/types.ts';
import { CREATE_PLAN_TOOL, createWeekPlanTool } from './create-plan-tool.ts';
import { EDIT_PLAN_TOOL, editPlanCellsTool } from './edit-plan-tool.ts';
import { DEFAULT_MODEL, NEURON_PRICES } from './models.ts';

// 인터뷰는 스펙 9장 7단계에서 붙인다. 지금은 페르소나 A로 식단표를 만들고 칸을 다시 추천하는 도구만 있다.
export function DietCoach() {
  useModel(DEFAULT_MODEL);

  // 지금 식단표. 만들기가 저장하고 칸 수정이 고친다. 도구는 이전 도구 결과를 읽을 수 없어서 상태로 들고 있는다.
  const [plan, setPlan] = usePersistentState<Plan>('plan');
  const delivery = useDelivery();
  useTool(createWeekPlanTool({ savePlan: setPlan }));
  useTool(editPlanCellsTool({ plan, savePlan: setPlan, delivery }));

  // 응답 하나의 사용량을 응답 metadata와 로그로 남긴다. 도구 안 harness.prompt 사용량은 들어가지 않는다 (스펙 11.5, B1).
  useResponseFinish(({ response, log }) => {
    const { input, output } = response.usage;
    const neurons = Math.round(estimateNeurons({ model: DEFAULT_MODEL, input, output }, NEURON_PRICES));
    log.info('응답 사용량', { input, output, neurons });
    return { usage: { model: DEFAULT_MODEL, input, output, neurons } };
  });

  return [
    '당신은 바쁜 직장인의 식단 코치입니다.',
    '일반적인 식단 지침을 따르며, 의료 조언은 하지 않습니다.',
    `사용자 메시지가 "${EDIT_REQUEST_PREFIX}"로 시작하면 ${EDIT_PLAN_TOOL} 도구를 한 번 부르세요. 칸과 요청은 도구가 메시지에서 직접 읽으므로 입력은 비워 두세요.`,
    `그 밖에 사용자가 식단표를 만들어 달라고 하면 ${CREATE_PLAN_TOOL} 도구를 한 번 부르세요.`,
  ].join('\n');
}
