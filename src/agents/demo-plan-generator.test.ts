// 개발용 가짜 생성기. 화면 개발 중 실제 모델(약 4분, 약 250 Neuron)을 부르지 않으려고 쓴다.
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { rulesA } from '../core/__fixtures__/rules-a.ts';
import { checkPlan } from '../core/check-plan.ts';
import { createDemoPlanGenerator } from './demo-plan-generator.ts';

const input = () => ({
  profile: structuredClone(profileA),
  rules: structuredClone(rulesA),
  classes: structuredClone(classesA),
  weekStart: planA.weekStart,
  events: [],
});

describe('createDemoPlanGenerator', () => {
  it('지연 뒤 checkPlan을 통과하는 페르소나 A 칸을 돌려주고, 사용량은 0이다', async () => {
    const res = await createDemoPlanGenerator({ delayMs: 0 }).generatePlan(input());

    expect(checkPlan({ ...planA, cells: res.value }, profileA, classesA, rulesA).passed).toBe(true);
    expect(res.usage).toMatchObject({ input: 0, output: 0 });
  });

  it('다시 추천은 요청한 칸을 페르소나 A에서 그대로 돌려준다', async () => {
    const res = await createDemoPlanGenerator({ delayMs: 0 }).regenerateCells({
      ...input(),
      plan: structuredClone(planA),
      targets: [{ day: 'tue', meal: 'lunch' }],
      violations: [],
    });

    expect(res.value).toEqual(planA.cells.filter((c) => c.day === 'tue' && c.meal === 'lunch'));
  });
});
