'use agent';
import { useModel } from '@flue/runtime';
import { DEFAULT_MODEL } from './models.ts';

// 자리만 잡아 둔 에이전트. 인터뷰와 식단표 생성은 스펙 9장 5~7단계에서 붙인다.
export function DietCoach() {
  useModel(DEFAULT_MODEL);
  return [
    '당신은 바쁜 직장인의 식단 코치입니다.',
    '일반적인 식단 지침을 따르며, 의료 조언은 하지 않습니다.',
  ].join('\n');
}
