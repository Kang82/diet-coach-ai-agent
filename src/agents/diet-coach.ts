'use agent';
import { useModel, useTool } from '@flue/runtime';
import { createWeekPlanTool } from './create-plan-tool.ts';
import { DEFAULT_MODEL } from './models.ts';

// 인터뷰는 스펙 9장 7단계에서 붙인다. 지금은 페르소나 A로 식단표를 만드는 도구만 있다.
export function DietCoach() {
  useModel(DEFAULT_MODEL);
  useTool(createWeekPlanTool);
  return [
    '당신은 바쁜 직장인의 식단 코치입니다.',
    '일반적인 식단 지침을 따르며, 의료 조언은 하지 않습니다.',
    '사용자가 식단표를 만들어 달라고 하면 create_week_plan 도구를 한 번 부르세요.',
  ].join('\n');
}
