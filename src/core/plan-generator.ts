// 스펙 4.3, 4.4. 식단표를 만드는 LLM 호출의 포트.
// 점검·다시 추천 루프(4.4)는 이 인터페이스만 알고, 실제 구현(Flue)은 src/agents에 둔다.
import type {
  CriteriaRules,
  MenuClassification,
  Plan,
  PlanCell,
  PlanEvent,
  Profile,
  Slot,
  Violation,
} from './types.ts';

/** LLM 호출 1번의 토큰 사용량. Neuron은 이 값과 모델 단가로 계산한다 (스펙 11.4). */
export interface TokenUsage {
  /** 호출에 쓴 모델 ID (src/agents/models.ts의 값) */
  model: string;
  input: number;
  output: number;
}

export interface LlmResult<T> {
  value: T;
  usage: TokenUsage;
}

export interface GeneratePlanInput {
  profile: Profile;
  rules: CriteriaRules;
  classes: MenuClassification[];
  weekStart: string;
  events: PlanEvent[];
}

export interface RegenerateCellsInput {
  plan: Plan;
  targets: Slot[];
  /** 무엇 때문에 다시 짜는지 */
  violations: Violation[];
  /** 사용자가 직접 바꿔 달라고 한 경우 */
  userRequest?: string;
  profile: Profile;
  rules: CriteriaRules;
  classes: MenuClassification[];
}

export interface PlanGenerator {
  /**
   * 1주일 칸 전체를 한 번의 호출로 만든다 (스펙 4.3).
   * 칸만 돌려준다. planId, weekStart, events 같은 Plan의 나머지는 LLM에 맡기지 않고 루프가 입력으로 채운다.
   */
  generatePlan(input: GeneratePlanInput): Promise<LlmResult<PlanCell[]>>;
  /** targets 칸만 다시 만든다 (스펙 4.4). */
  regenerateCells(input: RegenerateCellsInput): Promise<LlmResult<PlanCell[]>>;
}
