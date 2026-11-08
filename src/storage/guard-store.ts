// 스펙 11.4 한도 보호의 저장소: 토큰 해시 → 사용자, 날짜별 사용자 메시지 수, 시간별 Worker 전체 Neuron 추정치.
// 테이블은 migrations/0002_guard.sql(users, usage_daily), 0003_usage_hourly.sql, 0004_usage_reservations.sql,
// 0005_conversations.sql(사용자별 대화 ID, 대화 기록 지우기용), 0006(지난 식단표 목록용 열). 계약 테스트는 guard-store-contract.ts.
import type { ExpensiveKind } from '../core/message-kind.ts';
import type { D1Like } from './d1-storage.ts';

export interface GuardStore {
  /** 토큰 해시로 사용자 ID를 찾는다. 없으면 null */
  findUserByTokenHash(tokenHash: string): Promise<string | null>;
  /** 그날(UTC 'YYYY-MM-DD') 메시지 수를 하나 늘린다. 이미 limit이면 늘리지 않고 false */
  tryCountMessage(userId: string, day: string, limit: number): Promise<boolean>;
  /** fromHour(UTC 'YYYY-MM-DDTHH') 칸부터 지금까지 Worker 전체 Neuron 추정치 합계 (tasks.md T7-5) */
  neuronsSince(fromHour: string): Promise<number>;
  /** 그 시간 칸에 Neuron을 더한다 */
  addNeurons(hour: string, neurons: number): Promise<void>;
  /** 그날 그 종류(분류·만들기·칸 수정) 횟수를 하나 늘린다. 이미 limit이면 false (T10-3) */
  tryCountKind(userId: string, kind: ExpensiveKind, day: string, limit: number): Promise<boolean>;
  /** 진행 중 예약을 둔다. 같은 key면 덮어쓴다 (T10-4) */
  reserve(key: string, neurons: number, expiresAt: string): Promise<void>;
  /** now(ISO)보다 늦게 만료되는 예약의 합계. exceptKey의 예약은 뺀다(같은 대화가 예약을 덮어쓸 때) */
  reservedNeurons(now: string, exceptKey?: string): Promise<number>;
  /** 예약을 지운다. 없으면 아무 일도 없다 */
  release(key: string): Promise<void>;
  /** 메시지가 간 대화를 기록한다. 이미 있으면 그대로 (T15 대화 기록 지우기) */
  recordConversation(userId: string, conversationId: string, at: string): Promise<void>;
  /** 그 사용자의 대화 ID. 처음 기록한 순서 */
  conversationsOf(userId: string): Promise<string[]>;
  /** 그 사용자의 대화 중 준 ID를 기록에서 뺀다 (DO를 지운 뒤) */
  forgetConversations(userId: string, conversationIds: readonly string[]): Promise<void>;
  /** 식단표를 만들었거나 고친 대화에 시작 월요일과 시각을 둔다. 기록 없는 대화면 아무 일도 없다 (T17) */
  markConversationPlan(conversationId: string, weekStart: string, at: string): Promise<void>;
  /** 식단표가 있는 대화. 최근(plan_at) 순, limit개까지 */
  planConversations(userId: string, limit?: number): Promise<PlanConversation[]>;
}

export interface PlanConversation {
  conversationId: string;
  weekStart: string;
  planAt: string;
}

/** 지난 식단표 목록에 보일 최대 개수 */
export const PLAN_CONVERSATIONS_LIMIT = 20;

const userKey = (userId: string) => `user:${userId}`;
const kindKey = (userId: string, kind: ExpensiveKind) => `${kind}:${userId}`;

export class MemoryGuardStore implements GuardStore {
  private readonly users: Map<string, string>;
  private readonly calls = new Map<string, number>();
  private readonly neurons = new Map<string, number>();
  private readonly reservations = new Map<string, { neurons: number; expiresAt: string }>();
  private readonly conversations = new Map<string, { userId: string; at: string; plan?: { weekStart: string; at: string } }>();

  constructor(users: readonly { userId: string; tokenHash: string }[] = []) {
    this.users = new Map(users.map((u) => [u.tokenHash, u.userId]));
  }

  async findUserByTokenHash(tokenHash: string): Promise<string | null> {
    return this.users.get(tokenHash) ?? null;
  }

  async tryCountMessage(userId: string, day: string, limit: number): Promise<boolean> {
    return this.tryCount(`${day}|${userKey(userId)}`, limit);
  }

  async tryCountKind(userId: string, kind: ExpensiveKind, day: string, limit: number): Promise<boolean> {
    return this.tryCount(`${day}|${kindKey(userId, kind)}`, limit);
  }

  private tryCount(key: string, limit: number): boolean {
    const count = this.calls.get(key) ?? 0;
    if (count >= limit) return false;
    this.calls.set(key, count + 1);
    return true;
  }

  async reserve(key: string, neurons: number, expiresAt: string): Promise<void> {
    this.reservations.set(key, { neurons, expiresAt });
  }

  async reservedNeurons(now: string, exceptKey?: string): Promise<number> {
    let sum = 0;
    for (const [key, r] of this.reservations) if (r.expiresAt > now && key !== exceptKey) sum += r.neurons;
    return sum;
  }

  async release(key: string): Promise<void> {
    this.reservations.delete(key);
  }

  async recordConversation(userId: string, conversationId: string, at: string): Promise<void> {
    if (!this.conversations.has(conversationId)) this.conversations.set(conversationId, { userId, at });
  }

  async conversationsOf(userId: string): Promise<string[]> {
    return [...this.conversations]
      .filter(([, c]) => c.userId === userId)
      .sort(([, a], [, b]) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      .map(([id]) => id);
  }

  async forgetConversations(userId: string, conversationIds: readonly string[]): Promise<void> {
    for (const id of conversationIds) if (this.conversations.get(id)?.userId === userId) this.conversations.delete(id);
  }

  async markConversationPlan(conversationId: string, weekStart: string, at: string): Promise<void> {
    const c = this.conversations.get(conversationId);
    if (c) c.plan = { weekStart, at };
  }

  async planConversations(userId: string, limit = PLAN_CONVERSATIONS_LIMIT): Promise<PlanConversation[]> {
    return [...this.conversations]
      .flatMap(([id, c]) => (c.userId === userId && c.plan ? [{ conversationId: id, weekStart: c.plan.weekStart, planAt: c.plan.at }] : []))
      .sort((a, b) => (a.planAt < b.planAt ? 1 : a.planAt > b.planAt ? -1 : 0))
      .slice(0, limit);
  }

  /** 테스트용: 지금 예약 */
  reservationOf(key: string): { neurons: number; expiresAt: string } | undefined {
    return this.reservations.get(key);
  }

  async neuronsSince(fromHour: string): Promise<number> {
    let sum = 0;
    for (const [hour, neurons] of this.neurons) if (hour >= fromHour) sum += neurons;
    return sum;
  }

  async addNeurons(hour: string, neurons: number): Promise<void> {
    this.neurons.set(hour, (this.neurons.get(hour) ?? 0) + neurons);
  }

  /** 테스트용: 그 시간 칸의 Neuron을 정해 둔다 */
  setNeurons(hour: string, neurons: number): void {
    this.neurons.set(hour, neurons);
  }
}

export class D1GuardStore implements GuardStore {
  constructor(private readonly db: D1Like) {}

  async findUserByTokenHash(tokenHash: string): Promise<string | null> {
    const row = await this.db
      .prepare('SELECT user_id FROM users WHERE token_hash = ?')
      .bind(tokenHash)
      .first<{ user_id: string }>();
    return row?.user_id ?? null;
  }

  async tryCountMessage(userId: string, day: string, limit: number): Promise<boolean> {
    return this.tryCount(day, userKey(userId), limit);
  }

  async tryCountKind(userId: string, kind: ExpensiveKind, day: string, limit: number): Promise<boolean> {
    return this.tryCount(day, kindKey(userId, kind), limit);
  }

  private async tryCount(day: string, key: string, limit: number): Promise<boolean> {
    // 한 문장으로 확인과 증가를 해서 동시 요청이 와도 limit을 넘지 않는다. 상한이면 갱신되지 않아 행이 안 나온다
    const row = await this.db
      .prepare(
        `INSERT INTO usage_daily (day, key, calls) VALUES (?1, ?2, 1)
         ON CONFLICT (day, key) DO UPDATE SET calls = usage_daily.calls + 1 WHERE usage_daily.calls < ?3
         RETURNING calls`,
      )
      .bind(day, key, limit)
      .first<{ calls: number }>();
    // limit이 0이면 첫 INSERT도 막아야 한다
    return row !== null && row.calls <= limit;
  }

  async neuronsSince(fromHour: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COALESCE(SUM(neurons), 0) AS neurons FROM usage_hourly WHERE hour >= ?')
      .bind(fromHour)
      .first<{ neurons: number }>();
    return row?.neurons ?? 0;
  }

  async addNeurons(hour: string, neurons: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO usage_hourly (hour, neurons) VALUES (?1, ?2)
         ON CONFLICT (hour) DO UPDATE SET neurons = usage_hourly.neurons + excluded.neurons`,
      )
      .bind(hour, neurons)
      .run();
  }

  async reserve(key: string, neurons: number, expiresAt: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO usage_reservations (key, neurons, expires_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (key) DO UPDATE SET neurons = excluded.neurons, expires_at = excluded.expires_at`,
      )
      .bind(key, neurons, expiresAt)
      .run();
  }

  async reservedNeurons(now: string, exceptKey?: string): Promise<number> {
    // 빈 문자열 키는 쓰지 않는다(대화 ID는 비지 않음)
    const row = await this.db
      .prepare('SELECT COALESCE(SUM(neurons), 0) AS neurons FROM usage_reservations WHERE expires_at > ?1 AND key != ?2')
      .bind(now, exceptKey ?? '')
      .first<{ neurons: number }>();
    return row?.neurons ?? 0;
  }

  async release(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM usage_reservations WHERE key = ?').bind(key).run();
  }

  async recordConversation(userId: string, conversationId: string, at: string): Promise<void> {
    await this.db
      .prepare('INSERT OR IGNORE INTO conversations (conversation_id, user_id, created_at) VALUES (?1, ?2, ?3)')
      .bind(conversationId, userId, at)
      .run();
  }

  async conversationsOf(userId: string): Promise<string[]> {
    // D1Like에는 first·run만 있어 JSON 배열 한 행으로 받는다
    const row = await this.db
      .prepare(
        `SELECT json_group_array(conversation_id) AS ids FROM
         (SELECT conversation_id FROM conversations WHERE user_id = ? ORDER BY created_at, conversation_id)`,
      )
      .bind(userId)
      .first<{ ids: string }>();
    return row ? (JSON.parse(row.ids) as string[]) : [];
  }

  async markConversationPlan(conversationId: string, weekStart: string, at: string): Promise<void> {
    await this.db
      .prepare('UPDATE conversations SET plan_week_start = ?1, plan_at = ?2 WHERE conversation_id = ?3')
      .bind(weekStart, at, conversationId)
      .run();
  }

  async planConversations(userId: string, limit = PLAN_CONVERSATIONS_LIMIT): Promise<PlanConversation[]> {
    // D1Like에는 first·run만 있어 JSON 배열 한 행으로 받는다
    const row = await this.db
      .prepare(
        `SELECT json_group_array(json_object('conversationId', conversation_id, 'weekStart', plan_week_start, 'planAt', plan_at)) AS items
         FROM (SELECT conversation_id, plan_week_start, plan_at FROM conversations
               WHERE user_id = ?1 AND plan_at IS NOT NULL ORDER BY plan_at DESC, conversation_id LIMIT ?2)`,
      )
      .bind(userId, limit)
      .first<{ items: string }>();
    return row ? (JSON.parse(row.items) as PlanConversation[]) : [];
  }

  async forgetConversations(userId: string, conversationIds: readonly string[]): Promise<void> {
    if (conversationIds.length === 0) return;
    await this.db.batch(
      conversationIds.map((id) =>
        this.db.prepare('DELETE FROM conversations WHERE conversation_id = ? AND user_id = ?').bind(id, userId),
      ),
    );
  }
}
