// 스펙 11.4 한도 보호의 저장소: 토큰 해시 → 사용자, 날짜별 사용자 메시지 수, 시간별 Worker 전체 Neuron 추정치.
// 테이블은 migrations/0002_guard.sql(users, usage_daily), 0003_usage_hourly.sql, 0004_usage_reservations.sql,
// 0005_conversations.sql(사용자별 대화 ID, 대화 기록 지우기용), 0006(지난 식단표 목록용 열), 0007_invites.sql(초대 코드, T24), 0008_plan_checks.sql(먹었어요 체크, T25).
// 계약 테스트는 guard-store-contract.ts.
import type { ExpensiveKind } from '../core/message-kind.ts';
import { compareSlots } from '../core/plan-check.ts';
import type { Slot } from '../core/types.ts';
import type { D1Like } from './d1-storage.ts';

export interface GuardStore {
  /** 토큰 해시로 사용자 ID를 찾는다. 없으면 null */
  findUserByTokenHash(tokenHash: string): Promise<string | null>;
  /**
   * 초대 코드 하나를 쓰고 사용자를 만든다 (T24). 모르는 코드거나 상한까지 썼으면 false이고 사용자를 만들지 않는다.
   * 코드 사용은 확인과 증가를 한 번에 해서 동시 요청이 마지막 자리를 함께 쓰지 못한다
   */
  registerWithInvite(codeHash: string, user: NewUser): Promise<boolean>;
  /** 그날 그 key의 횟수를 하나 늘린다(발급 시도 T24, 체크 T25 등 key로 나눈다). 이미 limit이면 false */
  tryCountKey(key: string, day: string, limit: number): Promise<boolean>;
  /** 그날(UTC 'YYYY-MM-DD') 메시지 수를 하나 늘린다. 이미 limit이면 늘리지 않고 false */
  tryCountMessage(userId: string, day: string, limit: number): Promise<boolean>;
  /** fromHour(UTC 'YYYY-MM-DDTHH') 칸부터 지금까지 Worker 전체 Neuron 추정치 합계 (tasks.md T7-5) */
  neuronsSince(fromHour: string): Promise<number>;
  /** 그 시간 칸에 Neuron을 더한다 */
  addNeurons(hour: string, neurons: number): Promise<void>;
  /** 그날 그 종류(분류·만들기·칸 수정) 횟수를 하나 늘린다. 이미 limit이면 false (T10-3) */
  tryCountKind(userId: string, kind: ExpensiveKind, day: string, limit: number): Promise<boolean>;
  /**
   * 진행 중 예약 (T10-4, T19-7). 검사와 예약을 한 번에 한다(동시 요청이 함께 통과하지 않게).
   * 같은 key에 만료 전 예약이 있으면 busy, 최근 합계(fromHour 칸부터) + 만료 전 예약 + neurons가 limit을 넘으면 over_limit.
   * key는 사용자 ID라 사용자당 비싼 요청은 하나씩만 돈다
   */
  tryReserve(key: string, neurons: number, options: ReserveOptions): Promise<ReserveResult>;
  /** 예약을 지운다. 없으면 아무 일도 없다 */
  release(key: string): Promise<void>;
  /** 그 key에 now보다 늦게 만료되는 예약이 있는지. "모두 지우기"가 진행 중인 요청과 겹치지 않게 본다 (T22-4) */
  hasActiveReservation(key: string, now: string): Promise<boolean>;
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
  /**
   * 칸 하나를 먹었어요로 체크하거나(eaten) 해제한다 (T25). 그 사용자의 식단표 대화(plan_at 있음)가 아니면 false이고 아무것도 바꾸지 않는다.
   * 이미 그 상태면 그대로 true
   */
  setCheck(userId: string, conversationId: string, slot: Slot, eaten: boolean, at: string): Promise<boolean>;
  /** 그 사용자의 그 대화에서 체크한 칸. 칸 순서(요일 → 끼니) */
  checksOf(userId: string, conversationId: string): Promise<Slot[]>;
  /** 그 사용자의 체크를 모두 지운다 ("내 기록 모두 지우기") */
  deleteChecksOf(userId: string): Promise<void>;
}

export interface NewUser {
  userId: string;
  tokenHash: string;
  /** 만든 시각(ISO) */
  at: string;
}

export interface InviteSeed {
  codeHash: string;
  maxUses: number;
  used?: number;
}

export interface PlanConversation {
  conversationId: string;
  weekStart: string;
  planAt: string;
}

export interface ReserveOptions {
  /** 지금 시각(ISO). 이보다 늦게 만료되는 예약만 진행 중으로 본다 */
  now: string;
  /** 안전선 창의 첫 시간 칸(UTC 'YYYY-MM-DDTHH') */
  fromHour: string;
  limit: number;
  /** 이번 예약의 만료 시각(ISO) */
  expiresAt: string;
}

export type ReserveResult = 'ok' | 'busy' | 'over_limit';

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
  private readonly invites: Map<string, { maxUses: number; used: number }>;
  /** 대화 ID → 칸('day|meal') → 체크 */
  private readonly checks = new Map<string, Map<string, { userId: string; slot: Slot; at: string }>>();

  constructor(users: readonly { userId: string; tokenHash: string }[] = [], invites: readonly InviteSeed[] = []) {
    this.users = new Map(users.map((u) => [u.tokenHash, u.userId]));
    this.invites = new Map(invites.map((i) => [i.codeHash, { maxUses: i.maxUses, used: i.used ?? 0 }]));
  }

  async findUserByTokenHash(tokenHash: string): Promise<string | null> {
    return this.users.get(tokenHash) ?? null;
  }

  async registerWithInvite(codeHash: string, user: NewUser): Promise<boolean> {
    const invite = this.invites.get(codeHash);
    if (!invite || invite.used >= invite.maxUses) return false;
    invite.used += 1;
    this.users.set(user.tokenHash, user.userId);
    return true;
  }

  async tryCountKey(key: string, day: string, limit: number): Promise<boolean> {
    return this.tryCount(`${day}|${key}`, limit);
  }

  async setCheck(userId: string, conversationId: string, slot: Slot, eaten: boolean, at: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId || !conversation.plan) return false;
    const cells = this.checks.get(conversationId) ?? new Map();
    const key = `${slot.day}|${slot.meal}`;
    if (eaten) {
      if (!cells.has(key)) cells.set(key, { userId, slot: { day: slot.day, meal: slot.meal }, at });
    } else cells.delete(key);
    this.checks.set(conversationId, cells);
    return true;
  }

  async checksOf(userId: string, conversationId: string): Promise<Slot[]> {
    return [...(this.checks.get(conversationId)?.values() ?? [])]
      .filter((c) => c.userId === userId)
      .map((c) => c.slot)
      .sort(compareSlots);
  }

  async deleteChecksOf(userId: string): Promise<void> {
    for (const cells of this.checks.values()) {
      for (const [key, c] of cells) if (c.userId === userId) cells.delete(key);
    }
  }

  /** 테스트용: 그 코드를 쓴 수 */
  inviteUsed(codeHash: string): number | undefined {
    return this.invites.get(codeHash)?.used;
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

  async tryReserve(key: string, neurons: number, { now, fromHour, limit, expiresAt }: ReserveOptions): Promise<ReserveResult> {
    const mine = this.reservations.get(key);
    if (mine && mine.expiresAt > now) return 'busy';
    let reserved = 0;
    for (const r of this.reservations.values()) if (r.expiresAt > now) reserved += r.neurons;
    if ((await this.neuronsSince(fromHour)) + reserved + neurons > limit) return 'over_limit';
    this.reservations.set(key, { neurons, expiresAt });
    return 'ok';
  }

  async release(key: string): Promise<void> {
    this.reservations.delete(key);
  }

  async hasActiveReservation(key: string, now: string): Promise<boolean> {
    const r = this.reservations.get(key);
    return r !== undefined && r.expiresAt > now;
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

  async registerWithInvite(codeHash: string, user: NewUser): Promise<boolean> {
    // 확인과 증가를 한 문장으로 한다. 상한이면 갱신되지 않아 행이 안 나온다
    const used = await this.db
      .prepare('UPDATE invites SET used = used + 1 WHERE code_hash = ?1 AND used < max_uses RETURNING used')
      .bind(codeHash)
      .first<{ used: number }>();
    if (used === null) return false;
    // 사용자 넣기가 실패하면(토큰 해시 충돌, 사실상 없음) 그 코드 자리 하나는 쓴 채로 남는다
    await this.db
      .prepare('INSERT INTO users (user_id, token_hash, created_at) VALUES (?1, ?2, ?3)')
      .bind(user.userId, user.tokenHash, user.at)
      .run();
    return true;
  }

  async tryCountKey(key: string, day: string, limit: number): Promise<boolean> {
    return this.tryCount(day, key, limit);
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

  async tryReserve(key: string, neurons: number, { now, fromHour, limit, expiresAt }: ReserveOptions): Promise<ReserveResult> {
    // 한 문장으로 확인과 예약을 한다(D1은 문장 하나를 원자적으로 처리한다). 같은 key의 예약은 만료됐을 때만 덮어쓴다.
    // 같은 key의 만료 전 예약은 합계에서 빼도 된다: 있으면 덮어쓰지 않아 어차피 실패한다(busy)
    const row = await this.db
      .prepare(
        `INSERT INTO usage_reservations (key, neurons, expires_at)
         SELECT ?1, ?2, ?3
         WHERE (SELECT COALESCE(SUM(neurons), 0) FROM usage_hourly WHERE hour >= ?5)
             + (SELECT COALESCE(SUM(neurons), 0) FROM usage_reservations WHERE expires_at > ?4 AND key != ?1)
             + ?2 <= ?6
         ON CONFLICT (key) DO UPDATE SET neurons = excluded.neurons, expires_at = excluded.expires_at
           WHERE usage_reservations.expires_at <= ?4
         RETURNING key`,
      )
      .bind(key, neurons, expiresAt, now, fromHour, limit)
      .first<{ key: string }>();
    if (row !== null) return 'ok';
    // 실패 이유만 가린다(판정은 위 문장이 했다)
    const active = await this.db
      .prepare('SELECT 1 AS active FROM usage_reservations WHERE key = ?1 AND expires_at > ?2')
      .bind(key, now)
      .first<{ active: number }>();
    return active !== null ? 'busy' : 'over_limit';
  }

  async release(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM usage_reservations WHERE key = ?').bind(key).run();
  }

  async hasActiveReservation(key: string, now: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 AS active FROM usage_reservations WHERE key = ?1 AND expires_at > ?2')
      .bind(key, now)
      .first<{ active: number }>();
    return row !== null;
  }

  async recordConversation(userId: string, conversationId: string, at: string): Promise<void> {
    await this.db
      .prepare('INSERT OR IGNORE INTO conversations (conversation_id, user_id, created_at) VALUES (?1, ?2, ?3)')
      .bind(conversationId, userId, at)
      .run();
  }

  async conversationsOf(userId: string): Promise<string[]> {
    // D1Like에는 first·run만 있어 JSON 배열 한 행으로 받는다. SQLite는 하위 쿼리 ORDER BY가 json_group_array 순서로
    // 이어진다고 보장하지 않아 시각을 함께 받아 여기서 정렬한다 (T22-3)
    const row = await this.db
      .prepare(
        `SELECT json_group_array(json_array(conversation_id, created_at)) AS items
         FROM conversations WHERE user_id = ?`,
      )
      .bind(userId)
      .first<{ items: string }>();
    if (!row) return [];
    return (JSON.parse(row.items) as [string, string][])
      .sort(([idA, atA], [idB, atB]) => compare(atA, atB) || compare(idA, idB))
      .map(([id]) => id);
  }

  async markConversationPlan(conversationId: string, weekStart: string, at: string): Promise<void> {
    await this.db
      .prepare('UPDATE conversations SET plan_week_start = ?1, plan_at = ?2 WHERE conversation_id = ?3')
      .bind(weekStart, at, conversationId)
      .run();
  }

  async planConversations(userId: string, limit = PLAN_CONVERSATIONS_LIMIT): Promise<PlanConversation[]> {
    // D1Like에는 first·run만 있어 JSON 배열 한 행으로 받는다. LIMIT은 하위 쿼리 ORDER BY로 고르고(순서와 무관하게 맞는 행),
    // 나열 순서는 json_group_array가 보장하지 않아 여기서 다시 정렬한다 (T22-3)
    const row = await this.db
      .prepare(
        `SELECT json_group_array(json_object('conversationId', conversation_id, 'weekStart', plan_week_start, 'planAt', plan_at)) AS items
         FROM (SELECT conversation_id, plan_week_start, plan_at FROM conversations
               WHERE user_id = ?1 AND plan_at IS NOT NULL ORDER BY plan_at DESC, conversation_id LIMIT ?2)`,
      )
      .bind(userId, limit)
      .first<{ items: string }>();
    if (!row) return [];
    return (JSON.parse(row.items) as PlanConversation[]).sort(
      (a, b) => compare(b.planAt, a.planAt) || compare(a.conversationId, b.conversationId),
    );
  }

  async setCheck(userId: string, conversationId: string, slot: Slot, eaten: boolean, at: string): Promise<boolean> {
    // 식단표 대화인지 확인과 쓰기를 한 문장으로 한다. 이미 체크돼 있으면 시각을 바꾸지 않는다(처음 체크한 시각)
    const owned = `EXISTS (SELECT 1 FROM conversations WHERE conversation_id = ?1 AND user_id = ?2 AND plan_at IS NOT NULL)`;
    if (eaten) {
      await this.db
        .prepare(
          `INSERT OR IGNORE INTO plan_checks (conversation_id, day, meal, user_id, checked_at)
           SELECT ?1, ?3, ?4, ?2, ?5 WHERE ${owned}`,
        )
        .bind(conversationId, userId, slot.day, slot.meal, at)
        .run();
    } else {
      await this.db
        .prepare('DELETE FROM plan_checks WHERE conversation_id = ?1 AND user_id = ?2 AND day = ?3 AND meal = ?4')
        .bind(conversationId, userId, slot.day, slot.meal)
        .run();
    }
    // 바뀐 행 수로는 "이미 그 상태"와 "식단표 대화 아님"을 가릴 수 없어 한 번 더 본다
    const row = await this.db
      .prepare(`SELECT 1 AS ok WHERE ${owned}`)
      .bind(conversationId, userId)
      .first<{ ok: number }>();
    return row !== null;
  }

  async checksOf(userId: string, conversationId: string): Promise<Slot[]> {
    // D1Like에는 first·run만 있어 JSON 배열 한 행으로 받고 순서는 여기서 정한다 (T22-3과 같은 방식)
    const row = await this.db
      .prepare(
        `SELECT json_group_array(json_object('day', day, 'meal', meal)) AS items
         FROM plan_checks WHERE conversation_id = ?1 AND user_id = ?2`,
      )
      .bind(conversationId, userId)
      .first<{ items: string }>();
    if (!row) return [];
    return (JSON.parse(row.items) as Slot[]).sort(compareSlots);
  }

  async deleteChecksOf(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM plan_checks WHERE user_id = ?').bind(userId).run();
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

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
