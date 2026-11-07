// 스펙 4.2 외식 메뉴 분류 도구 (tasks.md B5).
// 화면이 "메뉴 분류 요청" 메시지를 보내면 모델이 이 도구를 부른다. 입력은 없고, 끝난 인터뷰(interviewResult)로 분류한다.
// 결과는 에이전트 상태(menuClasses)에 저장하고 도구 출력으로 화면에 보여 준다. 사용자가 바꾼 분류는 create_week_plan이 반영한다.
// 요청 메시지에 실린 기간 선택 화면의 일정(B6)을 검증해 기간(period)으로 함께 저장한다.
// 판단은 core/classify-runner.ts(테스트 있음, T9-5). 이 파일은 분류기를 고르고, 저장과 로그만 한다.
import { defineTool, type DeliveredMessage } from '@flue/runtime';
import * as v from 'valibot';
import { handleClassifyRequest } from '../core/classify-runner.ts';
import type { InterviewResult } from '../core/interview.ts';
import type { MenuClassifier } from '../core/menu-classifier.ts';
import type { PlanPeriod } from '../core/period.ts';
import type { MenuClassification } from '../core/types.ts';
import { createDemoMenuClassifier } from './demo-menu-classifier.ts';
import { createFlueMenuClassifier } from './flue-menu-classifier.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { menuClassModel } from './models.ts';
import type { NeuronMeter } from './metered-harness.ts';
import { countNeurons, metered, toJson } from './plan-tool-support.ts';

export const CLASSIFY_TOOL = 'classify_menus';

export function classifyMenusTool({
  interviewResult,
  saveClasses,
  savePeriod,
  delivery,
  meter,
}: {
  interviewResult: InterviewResult | undefined;
  saveClasses: (classes: MenuClassification[]) => void;
  savePeriod: (period: PlanPeriod) => void;
  delivery: DeliveredMessage;
  /** LLM 사용량을 전체 안전선 카운터에 더한다 (스펙 11.4-3) */
  meter: NeuronMeter;
}) {
  return defineTool({
    name: CLASSIFY_TOOL,
    description: '사용자가 외식으로 먹는 메뉴를 식단 기준에 맞춰 분류한다. 메뉴는 도구가 인터뷰 결과에서 직접 읽는다.',
    input: v.object({}),
    harness: true,
    async run({ harness, log }) {
      const result = await handleClassifyRequest({
        interviewResult,
        body: delivery.kind === 'user' ? delivery.body : undefined,
        classifier: pickClassifier(metered(harness, meter, log)),
        now: () => new Date(),
        neurons: (usages) => countNeurons(usages, log),
      });
      const { output, save, failure } = result;
      if (failure) {
        const { error } = failure;
        log.error('메뉴 분류 실패', { kind: failure.kind, message: error instanceof Error ? error.message : String(error), seconds: output.stats.seconds });
      } else if (output.status !== 'no_interview' && output.status !== 'bad_request') {
        log.info('메뉴 분류 끝', { status: output.status, ...output.stats });
      }
      // 분류가 끝났을 때만 분류와 기간을 저장한다 (T9-5)
      if (save) {
        saveClasses(save.classes);
        savePeriod(save.period);
      }
      return { output: toJson(output), terminate: true };
    },
  });
}

/** 개발용 가짜 분류: `.dev.vars`의 MENU_CLASSIFIER=demo. 모델은 MENU_MODEL로 바꿔 시험할 수 있다 (models.ts) */
function pickClassifier(harness: PromptHarness): MenuClassifier {
  return process.env.MENU_CLASSIFIER === 'demo'
    ? createDemoMenuClassifier()
    : createFlueMenuClassifier(harness, menuClassModel(process.env.MENU_MODEL));
}
