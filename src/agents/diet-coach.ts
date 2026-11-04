'use agent';
import { useModel } from '@flue/runtime';

// 자리만 잡아 둔 에이전트. 인터뷰와 식단표 생성은 스펙 9장 5~7단계에서 붙인다.
// 모델 ID는 설치된 Flue 2.3.0 카탈로그에 있는 값으로 두었다. LLM 단계에서 다시 정한다.
export function DietCoach() {
  useModel('anthropic/claude-sonnet-4-6');
  return [
    '당신은 바쁜 직장인의 식단 코치입니다.',
    '일반적인 식단 지침을 따르며, 의료 조언은 하지 않습니다.',
  ].join('\n');
}
