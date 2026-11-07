// 메뉴 분류 도구(classify_menus)의 판단 (스펙 4.2, tasks.md B5·B6, T9-5).
// 도구(agents/classify-menus-tool.ts)는 이 결과의 save가 있을 때만 분류와 기간을 저장하고 output을 돌려준다.
// 분류가 실패하면 기간도 저장하지 않는다(다시 요청하면 같은 일정으로 다시 정한다).
import type { ClassifyToolOutput, ClassifyToolStats } from './classify-tool-output.ts';
import { nextMondayKst } from './helpers.ts';
import type { InterviewResult } from './interview.ts';
import { runClassification, type MenuClassifier } from './menu-classifier.ts';
import { validateEvents, type PlanPeriod } from './period.ts';
import type { TokenUsage } from './plan-generator.ts';
import { parseClassifyRequest } from './plan-request.ts';
import { failureKind, failureMessage, type FailureKind } from './tool-failure.ts';
import type { MenuClassification } from './types.ts';

export const NO_INTERVIEW_MESSAGE = '인터뷰를 먼저 마쳐 주세요.';
export const BAD_EVENTS_MESSAGE = '일정을 읽지 못했어요. 기간 선택 화면에서 다시 넣어 주세요.';

export interface ClassifyRequestResult {
  output: ClassifyToolOutput;
  /** 성공했을 때만 있다 */
  save?: { classes: MenuClassification[]; period: PlanPeriod };
  /** 분류기가 던진 에러 (도구가 로그로 남긴다) */
  failure?: { kind: FailureKind; error: unknown };
}

export async function handleClassifyRequest({
  interviewResult,
  body,
  classifier,
  now,
  neurons,
}: {
  interviewResult: InterviewResult | undefined;
  /** 사용자 메시지 본문. 사용자 메시지가 아니면 undefined */
  body: string | undefined;
  classifier: MenuClassifier;
  /** 도구는 () => new Date() */
  now: () => Date;
  /** 사용량 → Neuron (운영은 plan-tool-support.ts의 countNeurons) */
  neurons: (usages: TokenUsage[]) => number;
}): Promise<ClassifyRequestResult> {
  const empty: ClassifyToolStats = { seconds: 0, usages: [], neurons: 0 };
  if (!interviewResult) return { output: { status: 'no_interview', message: NO_INTERVIEW_MESSAGE, stats: empty } };

  const request = body === undefined ? undefined : parseClassifyRequest(body);
  const checked = request && validateEvents(interviewResult.meals, request.events);
  if (!checked || checked.issues.length > 0) {
    return { output: { status: 'bad_request', message: BAD_EVENTS_MESSAGE, issues: checked?.issues ?? [], stats: empty } };
  }

  const startedAt = now().getTime();
  // 시작일은 여기서 정해 화면에 보여 준다. 만들 때 이미 시작한 주면 create_week_plan이 다시 정한다 (period.ts planWeekStart)
  const period: PlanPeriod = { weekStart: nextMondayKst(now()), events: checked.events };
  const seconds = () => Math.round((now().getTime() - startedAt) / 1000);

  let out: Awaited<ReturnType<typeof runClassification>>;
  try {
    out = await runClassification(classifier, interviewResult);
  } catch (error) {
    // 던지면 바깥 모델이 이 도구를 다시 부를 수 있다 (리뷰 1번). 결과로 답한다
    const kind = failureKind(error);
    return { output: { status: kind, message: failureMessage(kind), stats: { ...empty, seconds: seconds() } }, failure: { kind, error } };
  }
  const stats: ClassifyToolStats = { seconds: seconds(), usages: out.usages, neurons: neurons(out.usages) };
  if (out.kind !== 'ok') return { output: { status: out.kind, message: failureMessage(out.kind), stats } };
  return { output: { status: 'ok', classes: out.classes, period, stats }, save: { classes: out.classes, period } };
}
