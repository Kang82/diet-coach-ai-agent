// B12(T8-3). durable 도구의 step으로 LLM 호출을 감싼다.
// Durable Object가 재시작돼 도구가 다시 돌면, 끝난 호출은 기록값을 돌려주고 끊긴 호출부터 실제로 부른다.
// 이름은 호출 순번(llm:1, llm:2…)이다. 루프는 받은 값만으로 다음 호출을 정하므로 다시 돌아도 순번이 같다.
// 안쪽 호출이 던지면 기록하지 않고 같은 에러가 그대로 올라온다(Flue step.do 동작). 한도 초과·시간 초과 판정은 그대로다.
import type { CallOptions, LlmResult, PlanGenerator } from './plan-generator.ts';

/** Flue `ToolStep`과 같은 모양. core는 Flue를 import하지 않아 필요한 부분만 둔다 */
export interface StepRunner {
  do<T>(name: string, fn: () => T | Promise<T>): Promise<T>;
}

export function steppedGenerator(inner: PlanGenerator, step: StepRunner): PlanGenerator {
  let n = 0;
  const run = <T>(call: () => Promise<LlmResult<T>>) => step.do(`llm:${++n}`, call);
  return {
    generatePlan: (input, options?: CallOptions) => run(() => inner.generatePlan(input, options)),
    regenerateCells: (input, options?: CallOptions) => run(() => inner.regenerateCells(input, options)),
  };
}
