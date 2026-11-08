// 스펙 4.3, 4.4. 식단표를 만드는 LLM 호출의 포트.
// 점검·다시 추천 루프(4.4)는 이 인터페이스만 알고, 실제 구현(Flue)은 src/agents에 둔다.
import type { StreamStats } from './llm-timeout.ts';
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
  /**
   * 이 호출 동안 Workers AI 응답 스트림을 지켜본 결과 (B19, agents/stream-watch.ts). 바인딩 요청을 하나라도 봤을 때만.
   * 도구 결과 stats.usages와 평가 기록에 남아 실제 첫 바이트·최장 간격을 볼 수 있다
   */
  stream?: StreamStats;
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

/** 호출 하나의 옵션. limitMs는 루프가 도구 전체 예산에서 남은 시간으로 정한다 (tasks.md T8-4). 구현은 호출별 상한과 비교해 짧은 쪽을 쓴다 */
export interface CallOptions {
  limitMs?: number;
}

export interface PlanGenerator {
  /**
   * 1주일 칸 전체를 한 번의 호출로 만든다 (스펙 4.3).
   * 칸만 돌려준다. planId, weekStart, events 같은 Plan의 나머지는 LLM에 맡기지 않고 루프가 입력으로 채운다.
   */
  generatePlan(input: GeneratePlanInput, options?: CallOptions): Promise<LlmResult<PlanCell[]>>;
  /** targets 칸만 다시 만든다 (스펙 4.4). */
  regenerateCells(input: RegenerateCellsInput, options?: CallOptions): Promise<LlmResult<PlanCell[]>>;
}
