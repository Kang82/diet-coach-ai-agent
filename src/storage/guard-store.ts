// 스펙 11.4 한도 보호의 저장소: 토큰 해시 → 사용자, 날짜별 메시지 수와 Neuron 추정치.
// 테이블은 migrations/0002_guard.sql. 계약 테스트는 guard-store-contract.ts.
import type { D1Like } from './d1-storage.ts';

export interface GuardStore {
  /** 토큰 해시로 사용자 ID를 찾는다. 없으면 null */
  findUserByTokenHash(tokenHash: string): Promise<string | null>;
  /** 그날 메시지 수를 하나 늘린다. 이미 limit이면 늘리지 않고 false */
  tryCountMessage(userId: string, day: string, limit: number): Promise<boolean>;
  /** 그날 Worker 전체 Neuron 추정치 */
  neuronsOn(day: string): Promise<number>;
  addNeurons(day: string, neurons: number): Promise<void>;
}

const ALL = 'all';
const userKey = (userId: string) => `user:${userId}`;

export class MemoryGuardStore implements GuardStore {
  private readonly users: Map<string, string>;
  private readonly calls = new Map<string, number>();
  private readonly neurons = new Map<string, number>();

  constructor(users: readonly { userId: string; tokenHash: string }[] = []) {
    this.users = new Map(users.map((u) => [u.tokenHash, u.userId]));
  }

  async findUserByTokenHash(tokenHash: string): Promise<string | null> {
    return this.users.get(tokenHash) ?? null;
  }

  async tryCountMessage(userId: string, day: string, limit: number): Promise<boolean> {
    const key = `${day}|${userKey(userId)}`;
    const count = this.calls.get(key) ?? 0;
    if (count >= limit) return false;
    this.calls.set(key, count + 1);
    return true;
  }

  async neuronsOn(day: string): Promise<number> {
    return this.neurons.get(day) ?? 0;
  }

  async addNeurons(day: string, neurons: number): Promise<void> {
    this.neurons.set(day, (this.neurons.get(day) ?? 0) + neurons);
  }

  /** 테스트용: 그날 Neuron을 정해 둔다 */
  setNeurons(day: string, neurons: number): void {
    this.neurons.set(day, neurons);
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
    // 한 문장으로 확인과 증가를 해서 동시 요청이 와도 limit을 넘지 않는다. 상한이면 갱신되지 않아 행이 안 나온다
    const row = await this.db
      .prepare(
        `INSERT INTO usage_daily (day, key, calls) VALUES (?1, ?2, 1)
         ON CONFLICT (day, key) DO UPDATE SET calls = usage_daily.calls + 1 WHERE usage_daily.calls < ?3
         RETURNING calls`,
      )
      .bind(day, userKey(userId), limit)
      .first<{ calls: number }>();
    // limit이 0이면 첫 INSERT도 막아야 한다
    return row !== null && row.calls <= limit;
  }

  async neuronsOn(day: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT neurons FROM usage_daily WHERE day = ? AND key = ?')
      .bind(day, ALL)
      .first<{ neurons: number }>();
    return row?.neurons ?? 0;
  }

  async addNeurons(day: string, neurons: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO usage_daily (day, key, neurons) VALUES (?1, ?2, ?3)
         ON CONFLICT (day, key) DO UPDATE SET neurons = usage_daily.neurons + excluded.neurons`,
      )
      .bind(day, ALL, neurons)
      .run();
  }
}
