// 스펙 5장 저장소의 D1 구현 (T6-1). 테이블은 migrations/0001_init.sql.
// 조회에 쓰는 값(user_id, version, seq)만 열로 두고 프로필·식단표 본문은 JSON으로 저장한다.
// 꺼낼 때마다 JSON을 새로 파싱하므로 돌려준 값을 고쳐도 저장된 값은 그대로다.
import type { Plan, Profile } from '../core/types.ts';
import { ConsentRequiredError, type Storage } from './storage.ts';

/** 이 파일이 쓰는 D1 API만 적은 최소 타입. Worker의 env.DB(D1Database)가 그대로 맞는다. */
export interface D1Like {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown[]>;
}

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export class D1Storage implements Storage {
  constructor(private readonly db: D1Like) {}

  async getProfile(userId: string): Promise<Profile | null> {
    const row = await this.db
      .prepare('SELECT version, data FROM profiles WHERE user_id = ?')
      .bind(userId)
      .first<{ version: number; data: string }>();
    return row ? { ...(JSON.parse(row.data) as Profile), version: row.version } : null;
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    if (!profile.consentedAt) throw new ConsentRequiredError();
    // 버전 증가를 한 문장으로 해서 동시에 저장해도 같은 버전이 두 번 나오지 않는다.
    // data에는 version을 빼고 넣는다. 버전은 열 값이 기준이다.
    const { version: _ignored, ...body } = profile;
    const row = await this.db
      .prepare(
        `INSERT INTO profiles (user_id, version, data, updated_at) VALUES (?1, 1, ?2, ?3)
         ON CONFLICT (user_id) DO UPDATE SET
           version = profiles.version + 1, data = excluded.data, updated_at = excluded.updated_at
         RETURNING version`,
      )
      .bind(profile.userId, JSON.stringify(body), profile.updatedAt)
      .first<{ version: number }>();
    if (!row) throw new Error('프로필 저장 결과를 받지 못했습니다.');
    return { ...structuredClone(profile), version: row.version };
  }

  async deleteUser(userId: string): Promise<void> {
    // batch는 한 트랜잭션이라 프로필만 지워지고 식단표가 남는 일이 없다.
    await this.db.batch([
      this.db.prepare('DELETE FROM profiles WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM plans WHERE user_id = ?').bind(userId),
    ]);
  }

  async savePlan(plan: Plan, conversationId?: string): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO plans (plan_id, user_id, week_start, data, created_at, conversation_id) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(plan.planId, plan.userId, plan.weekStart, JSON.stringify(plan), plan.createdAt, conversationId ?? null)
      .run();
  }

  async getPlanOfConversation(userId: string, conversationId: string): Promise<Plan | null> {
    const row = await this.db
      .prepare('SELECT data FROM plans WHERE user_id = ? AND conversation_id = ? ORDER BY seq DESC LIMIT 1')
      .bind(userId, conversationId)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as Plan) : null;
  }

  async getLatestPlan(userId: string): Promise<Plan | null> {
    const row = await this.db
      .prepare('SELECT data FROM plans WHERE user_id = ? ORDER BY seq DESC LIMIT 1')
      .bind(userId)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as Plan) : null;
  }
}
