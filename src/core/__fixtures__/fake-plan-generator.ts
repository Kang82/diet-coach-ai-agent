// 테스트용 가짜 PlanGenerator.
// 응답을 미리 순서대로 정해 두고, 받은 호출을 순서대로 기록한다.
import type {
  GeneratePlanInput,
  LlmResult,
  PlanGenerator,
  RegenerateCellsInput,
  TokenUsage,
} from '../plan-generator.ts';
import type { Plan, PlanCell } from '../types.ts';

/** 정해 둔 응답 하나. 값, 던질 에러, 또는 입력을 받아 값을 만드는 함수. */
export type FakeStep<I, T> = T | Error | ((input: I) => T);

export type FakeCall =
  | { method: 'generatePlan'; input: GeneratePlanInput }
  | { method: 'regenerateCells'; input: RegenerateCellsInput };

export const FAKE_USAGE: TokenUsage = { model: 'fake', input: 100, output: 200 };

export class FakePlanGenerator implements PlanGenerator {
  /** 받은 호출. 입력은 호출 시점의 복사본이라 루프가 나중에 고쳐도 바뀌지 않는다. */
  readonly calls: FakeCall[] = [];
  private readonly plans: FakeStep<GeneratePlanInput, Plan>[];
  private readonly regenerations: FakeStep<RegenerateCellsInput, PlanCell[]>[];
  private readonly usage: TokenUsage;

  constructor(options: {
    plans?: FakeStep<GeneratePlanInput, Plan>[];
    regenerations?: FakeStep<RegenerateCellsInput, PlanCell[]>[];
    usage?: TokenUsage;
  }) {
    this.plans = [...(options.plans ?? [])];
    this.regenerations = [...(options.regenerations ?? [])];
    this.usage = options.usage ?? FAKE_USAGE;
  }

  async generatePlan(input: GeneratePlanInput): Promise<LlmResult<Plan>> {
    this.calls.push({ method: 'generatePlan', input: structuredClone(input) });
    return this.respond('generatePlan', this.plans, input);
  }

  async regenerateCells(input: RegenerateCellsInput): Promise<LlmResult<PlanCell[]>> {
    this.calls.push({ method: 'regenerateCells', input: structuredClone(input) });
    return this.respond('regenerateCells', this.regenerations, input);
  }

  /** 호출한 메서드 이름만 순서대로. */
  get methods(): FakeCall['method'][] {
    return this.calls.map((c) => c.method);
  }

  private respond<I, T>(method: string, steps: FakeStep<I, T>[], input: I): LlmResult<T> {
    if (steps.length === 0) throw new Error(`FakePlanGenerator: ${method} 응답을 더 정해 두지 않음`);
    const step = steps.shift() as FakeStep<I, T>;
    if (step instanceof Error) throw step;
    const value = typeof step === 'function' ? (step as (input: I) => T)(input) : step;
    // 응답을 받은 쪽이 고쳐도 다음 테스트에 새지 않도록 복사해서 준다.
    return { value: structuredClone(value), usage: { ...this.usage } };
  }
}
