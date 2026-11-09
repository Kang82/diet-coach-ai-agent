import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { hashToken } from '../core/guard.ts';
import { resultFromProfile } from '../core/profile-store.ts';
import { MemoryGuardStore } from '../storage/guard-store.ts';
import { MemoryStorage } from '../storage/memory-storage.ts';
import { profileRoutes } from './profile-routes.ts';

let storage: MemoryStorage;
let guardStore: MemoryGuardStore;
let wiped: string[];
let failOn: string | undefined;
let app: Hono;

beforeEach(async () => {
  storage = new MemoryStorage();
  wiped = [];
  failOn = undefined;
  guardStore = new MemoryGuardStore([
    { userId: 'u1', tokenHash: await hashToken('t1') },
    { userId: 'u2', tokenHash: await hashToken('t2') },
  ]);
  app = new Hono();
  app.route(
    '/api/profile',
    profileRoutes({
      getGuardStore: () => guardStore,
      getStorage: () => storage,
      getWipeOne: () => async (id) => {
        if (id === failOn) throw new Error('network');
        wiped.push(id);
      },
    }),
  );
});

const call = (method: string, token?: string) =>
  app.request('/api/profile', { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('/api/profile', () => {
  it('토큰이 없거나 틀리면 401', async () => {
    expect((await call('GET')).status).toBe(401);
    expect((await call('DELETE', 'wrong')).status).toBe(401);
  });

  it('저장한 프로필이 없으면 null', async () => {
    const res = await call('GET', 't1');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('저장한 프로필은 인터뷰 결과 모양으로, 자기 것만', async () => {
    await storage.saveProfile({ ...profileA, userId: 'u1' });
    expect(await (await call('GET', 't1')).json()).toEqual({ result: resultFromProfile(profileA) });
    expect(await (await call('GET', 't2')).json()).toBeNull();
  });

  it('DELETE는 자기 프로필과 식단표만 지운다', async () => {
    await storage.saveProfile({ ...profileA, userId: 'u1' });
    await storage.savePlan({ ...planA, userId: 'u1' });
    await storage.saveProfile({ ...profileA, userId: 'u2' });
    const res = await call('DELETE', 't1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ failed: 0 });
    expect(await (await call('GET', 't1')).json()).toBeNull();
    expect(await storage.getLatestPlan('u1')).toBeNull();
    expect(await storage.getProfile('u2')).not.toBeNull();
  });
});

describe('DELETE /api/profile: 대화 기록도 지운다 (T15)', () => {
  it('저장 동의와 관계없이 그 사용자의 기록된 대화(DO)를 모두 지운다. 다른 사용자 대화는 그대로', async () => {
    await guardStore.recordConversation('u1', 'u1-a', '2026-11-08T01:00:00.000Z');
    await guardStore.recordConversation('u1', 'u1-b', '2026-11-08T02:00:00.000Z');
    await guardStore.recordConversation('u2', 'u2-a', '2026-11-08T01:00:00.000Z');

    const res = await call('DELETE', 't1');

    expect(await res.json()).toEqual({ failed: 0 });
    expect(wiped).toEqual(['u1-a', 'u1-b']);
    expect(await guardStore.conversationsOf('u1')).toEqual([]);
    expect(await guardStore.conversationsOf('u2')).toEqual(['u2-a']);
  });

  it('못 지운 대화 수를 알려 주고, 그 대화는 기록에 남는다. D1 프로필은 지운다', async () => {
    await storage.saveProfile({ ...profileA, userId: 'u1' });
    await guardStore.recordConversation('u1', 'u1-a', '2026-11-08T01:00:00.000Z');
    await guardStore.recordConversation('u1', 'u1-b', '2026-11-08T02:00:00.000Z');
    failOn = 'u1-b';

    const res = await call('DELETE', 't1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ failed: 1 });
    expect(await guardStore.conversationsOf('u1')).toEqual(['u1-b']);
    expect(await storage.getProfile('u1')).toBeNull();
  });

  it('같은 사용자의 만들기·분류·칸 수정이 진행 중(예약)이면 409 busy, 아무것도 지우지 않는다 (T22-4)', async () => {
    await storage.saveProfile({ ...profileA, userId: 'u1' });
    await guardStore.recordConversation('u1', 'u1-a', '2026-11-08T01:00:00.000Z');
    const reserve = { now: new Date().toISOString(), fromHour: '2000-01-01T00', limit: 100_000 };
    await guardStore.tryReserve('u1', 100, { ...reserve, expiresAt: new Date(Date.now() + 60_000).toISOString() });

    const res = await call('DELETE', 't1');

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { type: string } }).error.type).toBe('busy');
    expect(wiped).toEqual([]);
    expect(await guardStore.conversationsOf('u1')).toEqual(['u1-a']);
    expect(await storage.getProfile('u1')).not.toBeNull();
  });

  it('다른 사용자의 예약이나 만료된 예약은 막지 않는다 (T22-4)', async () => {
    await guardStore.recordConversation('u1', 'u1-a', '2026-11-08T01:00:00.000Z');
    const reserve = { now: '2000-01-01T00:00:00.000Z', fromHour: '2000-01-01T00', limit: 100_000 };
    await guardStore.tryReserve('u2', 100, { ...reserve, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await guardStore.tryReserve('u1', 100, { ...reserve, expiresAt: '2000-01-01T00:20:00.000Z' });

    const res = await call('DELETE', 't1');

    expect(res.status).toBe(200);
    expect(wiped).toEqual(['u1-a']);
  });

  it('토큰이 없으면 아무것도 지우지 않는다', async () => {
    await guardStore.recordConversation('u1', 'u1-a', '2026-11-08T01:00:00.000Z');
    expect((await call('DELETE')).status).toBe(401);
    expect(wiped).toEqual([]);
  });
});
