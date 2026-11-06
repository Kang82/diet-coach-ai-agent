// 스펙 4.2 외식 메뉴 분류 도구 (tasks.md B5).
// 화면이 "메뉴 분류 요청" 메시지를 보내면 모델이 이 도구를 부른다. 입력은 없고, 끝난 인터뷰(interviewResult)로 분류한다.
// 결과는 에이전트 상태(menuClasses)에 저장하고 도구 출력으로 화면에 보여 준다. 사용자가 바꾼 분류는 create_week_plan이 반영한다.
// 요청 메시지에 실린 기간 선택 화면의 일정(B6)을 검증해 기간(period)으로 함께 저장한다. 시작일은 이때 고정한다.
import { defineTool, type DeliveredMessage } from '@flue/runtime';
import * as v from 'valibot';
import type { ClassifyToolOutput } from '../core/classify-tool-output.ts';
import { nextMondayKst } from '../core/helpers.ts';
import { validateEvents, type PlanPeriod } from '../core/period.ts';
import { parseClassifyRequest } from '../core/plan-request.ts';
import type { InterviewResult } from '../core/interview.ts';
import { runClassification, type MenuClassifier } from '../core/menu-classifier.ts';
import { LLM_TIMEOUT_MESSAGE } from '../core/llm-timeout.ts';
import { failureKind, failureMessage } from '../core/tool-failure.ts';
import { QUOTA_EXCEEDED_MESSAGE } from '../core/quota.ts';
import type { MenuClassification } from '../core/types.ts';
import { createDemoMenuClassifier } from './demo-menu-classifier.ts';
import { createFlueMenuClassifier } from './flue-menu-classifier.ts';
import type { PromptHarness } from './flue-plan-generator.ts';
import { menuClassModel } from './models.ts';
import type { NeuronMeter } from './metered-harness.ts';
import { countNeurons, metered, toJson } from './plan-tool-support.ts';

export const CLASSIFY_TOOL = 'classify_menus';

export const BAD_EVENTS_MESSAGE = '일정을 읽지 못했어요. 기간 선택 화면에서 다시 넣어 주세요.';

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
      const done = (output: ClassifyToolOutput) => ({ output: toJson(output), terminate: true });
      const startedAt = Date.now();
      if (!interviewResult) {
        return done({
          status: 'no_interview',
          message: '인터뷰를 먼저 마쳐 주세요.',
          stats: { seconds: 0, usages: [], neurons: 0 },
        });
      }

      const request = delivery.kind === 'user' ? parseClassifyRequest(delivery.body) : undefined;
      const checked = request && validateEvents(interviewResult.meals, request.events);
      if (!checked || checked.issues.length > 0) {
        return done({
          status: 'bad_request',
          message: BAD_EVENTS_MESSAGE,
          issues: checked?.issues ?? [],
          stats: { seconds: 0, usages: [], neurons: 0 },
        });
      }
      const period: PlanPeriod = { weekStart: nextMondayKst(new Date()), events: checked.events };

      let out: Awaited<ReturnType<typeof runClassification>>;
      try {
        out = await runClassification(pickClassifier(metered(harness, meter, log)), interviewResult);
      } catch (error) {
        // 던지면 바깥 모델이 이 도구를 다시 부를 수 있다 (리뷰 1번). 결과로 답하고 턴을 끝낸다
        const kind = failureKind(error);
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        log.error('메뉴 분류 실패', { kind, message: error instanceof Error ? error.message : String(error), seconds });
        const status = kind === 'quota' ? 'quota' : kind === 'timeout' ? 'timeout' : 'error';
        return done({ status, message: failureMessage(kind), stats: { seconds, usages: [], neurons: 0 } });
      }
      const stats = {
        seconds: Math.round((Date.now() - startedAt) / 1000),
        usages: out.usages,
        neurons: countNeurons(out.usages, log),
      };
      log.info('메뉴 분류 끝', { kind: out.kind, ...stats });

      if (out.kind === 'quota') return done({ status: 'quota', message: QUOTA_EXCEEDED_MESSAGE, stats });
      if (out.kind === 'timeout') return done({ status: 'timeout', message: LLM_TIMEOUT_MESSAGE, stats });
      saveClasses(out.classes);
      savePeriod(period);
      return done({ status: 'ok', classes: out.classes, period, stats });
    },
  });
}

/** 개발용 가짜 분류: `.dev.vars`의 MENU_CLASSIFIER=demo. 모델은 MENU_MODEL로 바꿔 시험할 수 있다 (models.ts) */
function pickClassifier(harness: PromptHarness): MenuClassifier {
  return process.env.MENU_CLASSIFIER === 'demo'
    ? createDemoMenuClassifier()
    : createFlueMenuClassifier(harness, menuClassModel(process.env.MENU_MODEL));
}
