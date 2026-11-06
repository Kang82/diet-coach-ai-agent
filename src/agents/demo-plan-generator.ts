// 개발용 가짜 PlanGenerator. `.dev.vars`에 PLAN_GENERATOR=demo를 넣으면 create_week_plan이 이것을 쓴다.
// 실제 모델 대신 페르소나 A 식단표 칸을 잠시 뒤 돌려준다. 화면 개발 중 4분 대기와 Neuron 소모를 피하려는 것이다.
// 바깥 턴(모델이 도구를 고르는 호출)은 여전히 실제 모델을 부른다.
import { planA } from '../core/__fixtures__/persona-a.ts';
import { sameSlot } from '../core/helpers.ts';
import type { PlanGenerator, TokenUsage } from '../core/plan-generator.ts';
import { DEFAULT_MODEL } from './models.ts';

const NO_USAGE: TokenUsage = { model: DEFAULT_MODEL, input: 0, output: 0 };

export function createDemoPlanGenerator({ delayMs = 5_000 }: { delayMs?: number } = {}): PlanGenerator {
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  return {
    async generatePlan() {
      await wait();
      return { value: structuredClone(planA.cells), usage: NO_USAGE };
    },
    async regenerateCells({ targets }) {
      await wait();
      const cells = planA.cells.filter((cell) => targets.some((t) => sameSlot(t, cell)));
      return { value: structuredClone(cells), usage: NO_USAGE };
    },
  };
}
