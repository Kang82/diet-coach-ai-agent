// 스펙 4.1 인터뷰 제출 도구 (tasks.md B4).
// 인터뷰는 화면에서 단계별로 진행하고(core/interview-form.ts), 끝나면 "인터뷰 제출:" 메시지를 한 번 보낸다.
// 도구는 그 메시지를 useDelivery()로 직접 읽는다 (edit-plan-tool.ts와 같은 방식). 모델은 내용을 옮겨 적지 않는다.
// 목표 메모 확인과 applyTurn은 core/interview-runner.ts가 하고, 이 도구는 결과를 저장한다.
import { defineTool, type DeliveredMessage } from '@flue/runtime';
import * as v from 'valibot';
import { nextField, type InterviewResult } from '../core/interview.ts';
import { submissionJson } from '../core/interview-form.ts';
import { submitInterview } from '../core/interview-runner.ts';
import type { InterviewToolOutput } from '../core/interview-tool-output.ts';
import { createFlueGoalNoteChecker } from './flue-goal-note-checker.ts';
import { parseInterviewSubmission } from './interview-schema.ts';
import { goalNoteModel } from './models.ts';
import { countNeurons, toJson } from './plan-tool-support.ts';

export const INTERVIEW_TOOL = 'submit_interview';

const BAD_REQUEST = '인터뷰 답을 읽지 못했어요. 처음부터 다시 진행해 주세요.';

export function submitInterviewTool({
  saveResult,
  delivery,
}: {
  saveResult: (result: InterviewResult) => void;
  delivery: DeliveredMessage;
}) {
  return defineTool({
    name: INTERVIEW_TOOL,
    description: '화면에서 끝낸 인터뷰 답을 확인하고 저장한다. 답은 도구가 사용자 메시지에서 직접 읽는다.',
    input: v.object({}),
    harness: true,
    async run({ harness, log }) {
      const done = (output: InterviewToolOutput) => ({ output: toJson(output), terminate: true });
      const startedAt = Date.now();
      const submission = parseInterviewSubmission(delivery.kind === 'user' ? submissionJson(delivery.body) : undefined);
      if (!submission || nextField(submission.draft) !== null) {
        return done({ status: 'bad_request', message: { text: BAD_REQUEST }, stats: { seconds: 0, usages: [], neurons: 0 } });
      }

      // nodejs_compat에서는 Worker의 vars가 process.env로도 들어온다 (plan-tool-support.ts의 pickGenerator와 같음)
      const checker = createFlueGoalNoteChecker(harness, goalNoteModel(process.env.INTERVIEW_MODEL));
      const out = await submitInterview(checker, submission);
      const stats = {
        seconds: Math.round((Date.now() - startedAt) / 1000),
        usages: out.usages,
        neurons: countNeurons(out.usages, log),
      };
      log.info('인터뷰 제출 끝', { kind: out.kind, ...stats });

      switch (out.kind) {
        case 'done':
          saveResult(out.result);
          return done({ status: 'done', message: out.message, summary: out.summary, stats });
        case 'ask':
          return done({ status: 'ask', message: out.message, state: out.state, next: out.next, stats });
        case 'stop':
        case 'quota':
          return done({ status: out.kind, message: out.message, stats });
      }
    },
  });
}
