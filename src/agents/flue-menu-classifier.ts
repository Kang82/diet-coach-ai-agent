// 외식 메뉴 분류의 Flue 구현 (스펙 4.2, tasks.md B5). harness.prompt(..., { result })로 분류를 받는다.
// 대상과 1:1인지는 스키마가 보고(맞지 않으면 Flue가 다시 요청), 정리는 core의 runClassification이 한다.
// 사용량과 한도 초과 에러는 목표 메모 확인(flue-goal-note-checker.ts)과 같은 모양으로 바꾼다.
import type { PromptResultResponse } from '@flue/runtime';
import { LLM_TIME_LIMITS } from '../core/llm-timeout.ts';
import { buildClassifyPrompt } from '../core/menu-classification.ts';
import type { MenuClassifier } from '../core/menu-classifier.ts';
import { toTokenUsage, type PromptHarness } from './flue-plan-generator.ts';
import { menuClassesSchema, toMenuClassifications, type MenuClassesOutput } from './menu-schema.ts';
import { INTERVIEW_THINKING } from './models.ts';
import { promptWithLimit } from './prompt-call.ts';

export function createFlueMenuClassifier(harness: PromptHarness, model: string): MenuClassifier {
  return {
    async classify(input) {
      const res = (await promptWithLimit(
        harness,
        buildClassifyPrompt(input),
        // 짧은 구조화 출력이라 인터뷰와 같은 추론 수준을 쓴다
        { result: menuClassesSchema(input.menus), model, thinkingLevel: INTERVIEW_THINKING },
        LLM_TIME_LIMITS.menuClass,
      )) as PromptResultResponse<MenuClassesOutput>;
      return { value: toMenuClassifications(res.data), usage: toTokenUsage(res) };
    },
  };
}
