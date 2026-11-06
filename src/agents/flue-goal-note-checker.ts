// 목표 메모 확인의 Flue 구현 (스펙 4.1, tasks.md B4). harness.prompt(..., { result })로 분류 결과를 받는다.
// 사용량과 한도 초과 에러는 식단표 생성(flue-plan-generator.ts)과 같은 모양으로 바꾼다.
import type { PromptResultResponse } from '@flue/runtime';
import { buildGoalNotePrompt } from '../core/interview-note.ts';
import type { GoalNoteChecker } from '../core/interview-runner.ts';
import { isQuotaExceeded, QuotaExceededError } from '../core/quota.ts';
import { toTokenUsage, type PromptHarness } from './flue-plan-generator.ts';
import { GoalNoteCheckSchema, toGoalNoteCheck, type GoalNoteCheckOutput } from './interview-schema.ts';
import { INTERVIEW_THINKING } from './models.ts';

export function createFlueGoalNoteChecker(harness: PromptHarness, model: string): GoalNoteChecker {
  return {
    async check(input) {
      let res: PromptResultResponse<GoalNoteCheckOutput>;
      try {
        res = (await harness.prompt(buildGoalNotePrompt(input), {
          result: GoalNoteCheckSchema,
          model,
          thinkingLevel: INTERVIEW_THINKING,
        })) as PromptResultResponse<GoalNoteCheckOutput>;
      } catch (error) {
        if (isQuotaExceeded(error)) throw new QuotaExceededError({ cause: error });
        throw error;
      }
      return { value: toGoalNoteCheck(res.data), usage: toTokenUsage(res) };
    },
  };
}
