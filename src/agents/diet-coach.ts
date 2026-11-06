'use agent';
import { useModel, useResponseFinish, useTool } from '@flue/runtime';
import { estimateNeurons } from '../core/neurons.ts';
import { createWeekPlanTool } from './create-plan-tool.ts';
import { DEFAULT_MODEL, NEURON_PRICES } from './models.ts';

// 인터뷰는 스펙 9장 7단계에서 붙인다. 지금은 페르소나 A로 식단표를 만드는 도구만 있다.
export function DietCoach() {
  useModel(DEFAULT_MODEL);
  useTool(createWeekPlanTool);

  // 응답 하나의 전체 토큰 사용량을 응답 metadata와 로그로 남긴다 (tasks.md T2-2: 바깥 턴 사용량).
  // 도구 안 harness.prompt 사용량이 여기에 들어가는지는 실제 실행으로 확인한다. 누적과 안전선은 T7-3.
  useResponseFinish(({ response, log }) => {
    const { input, output } = response.usage;
    const neurons = Math.round(estimateNeurons({ model: DEFAULT_MODEL, input, output }, NEURON_PRICES));
    log.info('응답 사용량', { input, output, neurons });
    return { usage: { model: DEFAULT_MODEL, input, output, neurons } };
  });

  return [
    '당신은 바쁜 직장인의 식단 코치입니다.',
    '일반적인 식단 지침을 따르며, 의료 조언은 하지 않습니다.',
    '사용자가 식단표를 만들어 달라고 하면 create_week_plan 도구를 한 번 부르세요.',
  ].join('\n');
}
