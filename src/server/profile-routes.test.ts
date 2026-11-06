import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { hashToken } from '../core/guard.ts';
import { resultFromProfile } from '../core/profile-store.ts';
import { MemoryGuardStore } from '../storage/guard-store.ts';
import { MemoryStorage } from '../storage/memory-storage.ts';
import { profileRoutes } from './profile-routes.ts';

let storage: MemoryStorage;
let app: Hono;

beforeEach(async () => {
  storage = new MemoryStorage();
  const guardStore = new MemoryGuardStore([
    { userId: 'u1', tokenHash: await hashToken('t1') },
    { userId: 'u2', tokenHash: await hashToken('t2') },
  ]);
  app = new Hono();
  app.route('/api/profile', profileRoutes({ getGuardStore: () => guardStore, getStorage: () => storage }));
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
    expect((await call('DELETE', 't1')).status).toBe(204);
    expect(await (await call('GET', 't1')).json()).toBeNull();
    expect(await storage.getLatestPlan('u1')).toBeNull();
    expect(await storage.getProfile('u2')).not.toBeNull();
  });
});
