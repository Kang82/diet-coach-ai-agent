// T25: 식단표 칸 먹었어요 체크 (GET·PUT /api/checks/:conversationId)
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorBody, hashToken } from '../core/guard.ts';
import { USER_DAILY_CHECK_LIMIT } from '../core/plan-check.ts';
import { MemoryGuardStore } from '../storage/guard-store.ts';
import { checkRoutes } from './check-routes.ts';

const TOKEN = 'token-a';
const PLAN = 'abc-plan1';
const NO_PLAN = 'abc-noplan';

let store: MemoryGuardStore;
let now: Date;
let app: Hono;

beforeEach(async () => {
  store = new MemoryGuardStore([
    { userId: 'abc', tokenHash: await hashToken(TOKEN) },
    { userId: 'xyz', tokenHash: await hashToken('token-x') },
  ]);
  await store.recordConversation('abc', PLAN, '2026-11-10T00:00:00.000Z');
  await store.markConversationPlan(PLAN, '2026-11-09', '2026-11-10T00:00:00.000Z');
  await store.recordConversation('abc', NO_PLAN, '2026-11-10T00:00:00.000Z');
  now = new Date('2026-11-10T12:00:00Z');
  app = new Hono();
  app.route('/api/checks', checkRoutes({ getGuardStore: () => store, now: () => now }));
});

const auth = (token = TOKEN) => ({ authorization: `Bearer ${token}` });
const put = (conversationId: string, body: unknown, token = TOKEN) =>
  app.request(`/api/checks/${conversationId}`, {
    method: 'PUT',
    headers: { ...auth(token), 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const get = async (conversationId: string, token = TOKEN) => {
  const res = await app.request(`/api/checks/${conversationId}`, { headers: auth(token) });
  return { status: res.status, body: (await res.json()) as unknown };
};

describe('/api/checks', () => {
  it('체크하면 GET에 보이고, 해제하면 빠진다', async () => {
    expect((await put(PLAN, { day: 'tue', meal: 'lunch', eaten: true })).status).toBe(200);
    expect((await put(PLAN, { day: 'mon', meal: 'dinner', eaten: true })).status).toBe(200);
    expect(await get(PLAN)).toEqual({
      status: 200,
      body: { checks: [{ day: 'mon', meal: 'dinner' }, { day: 'tue', meal: 'lunch' }] },
    });
    expect((await put(PLAN, { day: 'mon', meal: 'dinner', eaten: false })).status).toBe(200);
    expect((await get(PLAN)).body).toEqual({ checks: [{ day: 'tue', meal: 'lunch' }] });
  });

  it('토큰이 없거나 틀리면 401', async () => {
    expect((await app.request(`/api/checks/${PLAN}`)).status).toBe(401);
    expect((await put(PLAN, { day: 'mon', meal: 'lunch', eaten: true }, 'nope')).status).toBe(401);
  });

  it('다른 사용자 접두어의 대화는 403 (읽기·쓰기 모두)', async () => {
    expect((await get(PLAN, 'token-x')).status).toBe(403);
    const res = await put(PLAN, { day: 'mon', meal: 'lunch', eaten: true }, 'token-x');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(errorBody('forbidden'));
  });

  it('본문이 틀리면 400 (모르는 칸, eaten 문자열, JSON 아님, 256B 초과)', async () => {
    for (const body of [
      { day: 'mon', meal: 'snack', eaten: true },
      { day: 'mon', meal: 'lunch', eaten: 'yes' },
      'x',
      { day: 'mon', meal: 'lunch', eaten: true, pad: 'x'.repeat(300) },
    ]) {
      const res = await put(PLAN, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(errorBody('check_rejected'));
    }
  });

  it('식단표가 없는 대화나 기록 없는 대화는 404', async () => {
    const res = await put(NO_PLAN, { day: 'mon', meal: 'lunch', eaten: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(errorBody('check_not_found'));
    expect((await put('abc-unknown', { day: 'mon', meal: 'lunch', eaten: true })).status).toBe(404);
    expect((await get(NO_PLAN)).body).toEqual({ checks: [] });
  });

  it(`하루 ${USER_DAILY_CHECK_LIMIT}번 넘게 바꾸면 429, 다음 날(UTC) 다시 된다`, async () => {
    for (let i = 0; i < USER_DAILY_CHECK_LIMIT; i++) {
      expect((await put(PLAN, { day: 'mon', meal: 'lunch', eaten: i % 2 === 0 })).status).toBe(200);
    }
    const res = await put(PLAN, { day: 'mon', meal: 'lunch', eaten: true });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual(errorBody('check_limit'));
    now = new Date('2026-11-11T00:00:00Z');
    expect((await put(PLAN, { day: 'mon', meal: 'lunch', eaten: true })).status).toBe(200);
  });
});
