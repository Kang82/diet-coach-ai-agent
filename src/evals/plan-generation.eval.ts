// 스펙 8.5 평가 세트: 식단표 생성. 실제 모델을 부르므로 npm test에 들어가지 않는다.
//
//   npm run dev -- --port 5199            (다른 터미널)
//   npm run evals                          (전부)
//   npm run evals -- -t 페르소나A          (페르소나 하나)
//   EVAL_RUNS=1 npm run evals -- -t 페르소나A
//
// 1회에 약 4분, 약 300 Neuron (식단표 약 250 + 메뉴 분류 약 50, 스펙 11.5). 기본은 페르소나별 2회다.
// 한도 초과가 나면 그 실행을 "건너뜀"으로 기록하고 남은 실행도 모두 건너뛴다 (스펙 11.3-5).
//
// 회차마다 새 대화에 인터뷰 제출(메모 없음, LLM 없음) → 메뉴 분류 → 식단표 만들기를 보낸다 (support/prepare.ts).
// 분류는 픽스처 값으로 바꿔 보내므로 점검 기준은 회차마다 같다. 페르소나 2~4는 프로필과 분류 픽스처를 더하면 된다 (T1-7).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classesA, profileA } from '../core/__fixtures__/persona-a.ts';
import { checkPlan } from '../core/check-plan.ts';
import { buildCriteria } from '../core/criteria.ts';
import { isQuotaExceeded } from '../core/quota.ts';
import { formatPlanRequest } from '../core/plan-request.ts';
import type { PlanToolOutput } from '../core/plan-tool-output.ts';
import type { MenuClassification, Profile } from '../core/types.ts';
import { recordRun, writeReport, type RunRecord } from './support/report.ts';
import { assertServerUp, parseToolOutput, sendAndWait, toolParts } from './support/agent-http.ts';
import { prepareConversation } from './support/prepare.ts';

const RUNS = Number(process.env.EVAL_RUNS ?? 2);
/** 스펙 8.5: 점검 루프 3회 안에 checkPlan 통과 8회 중 7회 이상 */
const PASS_RATE = 7 / 8;

interface Persona {
  name: string;
  profile: Profile;
  classes: MenuClassification[];
}

const personas: Persona[] = [{ name: '페르소나A', profile: profileA, classes: classesA }];

let quotaHit = false;
const records: RunRecord[] = [];

beforeAll(assertServerUp);
afterAll(() => writeReport(records));

for (const persona of personas) {
  describe(persona.name, () => {
    const results: ('pass' | 'fail' | 'skip')[] = [];

    for (let run = 1; run <= RUNS; run++) {
      it(`${run}회차: 식단표를 만들고 checkPlan으로 다시 점검한다`, async (ctx) => {
        if (quotaHit) {
          results.push('skip');
          ctx.skip('앞에서 한도 초과가 나서 건너뜀');
        }

        const prepared = await prepareConversation(persona.profile, persona.classes);
        if (prepared.failed) {
          const { step, res, quota } = prepared.failed;
          if (quota) {
            quotaHit = true;
            results.push('skip');
            recordRun(records, { persona: persona.name, run, result: 'skip', note: `한도 초과 (${step})`, res });
            ctx.skip('한도 초과로 건너뜀');
          }
          throw new Error(`${step} 단계에서 실패: ${prepared.conversationId}`);
        }

        const res = await sendAndWait(formatPlanRequest({ overrides: prepared.overrides }), {
          conversationId: prepared.conversationId,
        });
        const call = toolParts(res.snapshot, 'create_week_plan');
        const output = parseToolOutput<PlanToolOutput>(call.at(-1));

        if (output?.status === 'quota' || (res.outcome === 'failed' && isQuotaExceeded(res.error))) {
          quotaHit = true;
          results.push('skip');
          recordRun(records, { persona: persona.name, run, result: 'skip', note: '한도 초과', res });
          ctx.skip('한도 초과로 건너뜀');
        }

        // 도구를 정확히 한 번 부르고, 대화가 정상으로 끝난다
        expect(res.outcome, JSON.stringify(res.error)).toBe('completed');
        expect(call).toHaveLength(1);
        expect(output?.status).toMatch(/^(ok|violations)$/);

        // 도구가 돌려준 식단표를 평가 쪽에서도 같은 기준으로 다시 점검한다
        const rules = buildCriteria(persona.profile.goals);
        const plan = output!.status === 'ok' ? output!.plan : output!.status === 'violations' ? output!.lastPlan : undefined;
        expect(plan).toBeDefined();
        const check = checkPlan(plan!, persona.profile, prepared.classes, rules);
        expect(check.passed).toBe(output!.status === 'ok');

        const result = check.passed ? 'pass' : 'fail';
        results.push(result);
        recordRun(records, { persona: persona.name, run, result, res, output, violations: check.violations });
      });
    }

    it(`통과율 ${Math.round(PASS_RATE * 100)}% 이상 (건너뛴 실행 제외)`, (ctx) => {
      const done = results.filter((r) => r !== 'skip');
      if (done.length === 0) ctx.skip('실행한 회차가 없음');
      const passed = done.filter((r) => r === 'pass').length;
      expect(passed / done.length, `${passed}/${done.length} 통과`).toBeGreaterThanOrEqual(PASS_RATE);
    });
  });
}
