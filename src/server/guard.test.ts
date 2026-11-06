// 스펙 11.4 마지막 문단: 토큰 없음·틀림 → 401, 사용자 제한 초과 → 429, 안전선 초과 → 새 요청 차단·진행 중 요청 허용.
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { GLOBAL_DAILY_NEURON_LIMIT, hashToken, USER_DAILY_MESSAGE_LIMIT } from '../core/guard.ts';
import { MemoryGuardStore } from '../storage/guard-store.ts';
import { guardAgentRoutes, meHandler } from './guard.ts';

const MOUNT = '/agents/diet-coach';
const TOKEN_A = 'token-a';
const TOKEN_B = 'token-b';

let store: MemoryGuardStore;
let now: Date;
let reached: string[];
let app: Hono;

beforeEach(async () => {
  store = new MemoryGuardStore([
    { userId: 'abc', tokenHash: await hashToken(TOKEN_A) },
    { userId: 'ab', tokenHash: await hashToken(TOKEN_B) },
  ]);
  now = new Date('2026-11-06T12:00:00Z');
  reached = [];
  app = new Hono();
  const options = { getStore: () => store, now: () => now };
  app.get('/api/me', meHandler(options));
  app.use(`${MOUNT}/*`, guardAgentRoutes(MOUNT, options));
  app.all(`${MOUNT}/*`, (c) => {
    reached.push(`${c.req.method} ${c.req.path}`);
    return c.text('agent', 202);
  });
});

function call(method: string, path: string, token?: string | null, rawAuth?: string) {
  const headers: Record<string, string> = {};
  if (rawAuth !== undefined) headers.authorization = rawAuth;
  else if (token) headers.authorization = `Bearer ${token}`;
  return app.request(path, { method, headers });
}

async function errorType(res: Response) {
  return ((await res.json()) as { error: { type: string } }).error.type;
}

describe('토큰 확인 (11.4-1)', () => {
  it('토큰이 없으면 401', async () => {
    const res = await call('GET', `${MOUNT}/abc-1`);
    expect(res.status).toBe(401);
    expect(await errorType(res)).toBe('unauthorized');
    expect(reached).toEqual([]);
  });

  it('틀린 토큰이면 401', async () => {
    expect((await call('POST', `${MOUNT}/abc-1`, 'wrong')).status).toBe(401);
  });

  it('Bearer 형식이 아니면 401', async () => {
    expect((await call('GET', `${MOUNT}/abc-1`, null, TOKEN_A)).status).toBe(401);
    expect((await call('GET', `${MOUNT}/abc-1`, null, 'Bearer ')).status).toBe(401);
  });

  it('남의 대화면 403 (접두어만 비슷해도)', async () => {
    const res = await call('GET', `${MOUNT}/xyz-1`, TOKEN_A);
    expect(res.status).toBe(403);
    expect(await errorType(res)).toBe('forbidden');
    // 사용자 ab는 abc-1을 볼 수 없다
    expect((await call('GET', `${MOUNT}/abc-1`, TOKEN_B)).status).toBe(403);
    expect(reached).toEqual([]);
  });

  it('잘못 인코딩된 대화 ID는 403', async () => {
    expect((await call('GET', `${MOUNT}/abc-%E0%A4%A`, TOKEN_A)).status).toBe(403);
  });

  it('내 대화는 읽기, 보내기, abort 모두 통과', async () => {
    expect((await call('GET', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    expect((await call('POST', `${MOUNT}/abc-1/abort`, TOKEN_A)).status).toBe(202);
    expect(reached).toEqual([`GET ${MOUNT}/abc-1`, `POST ${MOUNT}/abc-1`, `POST ${MOUNT}/abc-1/abort`]);
  });

  it('/api/me: 토큰이 없으면 401, 맞으면 사용자 ID', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
    const res = await call('GET', '/api/me', TOKEN_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'abc' });
  });
});

describe('사용자별 하루 제한 (11.4-2)', () => {
  it(`메시지는 하루 ${USER_DAILY_MESSAGE_LIMIT}번까지, 넘으면 429`, async () => {
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT; i++) {
      expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    }
    const res = await call('POST', `${MOUNT}/abc-2`, TOKEN_A);
    expect(res.status).toBe(429);
    expect(await errorType(res)).toBe('user_daily_limit');
    expect(reached).toHaveLength(USER_DAILY_MESSAGE_LIMIT);
  });

  it('읽기와 abort는 세지 않고, 제한을 넘어도 통과', async () => {
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT + 5; i++) await call('GET', `${MOUNT}/abc-1`, TOKEN_A);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT; i++) await call('POST', `${MOUNT}/abc-1`, TOKEN_A);
    expect((await call('GET', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    expect((await call('POST', `${MOUNT}/abc-1/abort`, TOKEN_A)).status).toBe(202);
  });

  it('다른 사용자는 따로 세고, 다음 날(00:00 UTC)이면 다시 보낼 수 있다', async () => {
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT; i++) await call('POST', `${MOUNT}/abc-1`, TOKEN_A);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(429);
    expect((await call('POST', `${MOUNT}/ab-1`, TOKEN_B)).status).toBe(202);
    now = new Date('2026-11-07T00:00:00Z');
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });
});

describe('전체 하루 Neuron 안전선 (11.4-3)', () => {
  it('안전선 바로 아래면 통과', async () => {
    store.setNeurons('2026-11-06', GLOBAL_DAILY_NEURON_LIMIT - 1);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });

  it('안전선에 닿으면 새 메시지는 429, 진행 중인 대화 읽기와 abort는 통과', async () => {
    store.setNeurons('2026-11-06', GLOBAL_DAILY_NEURON_LIMIT);
    const res = await call('POST', `${MOUNT}/abc-1`, TOKEN_A);
    expect(res.status).toBe(429);
    expect(await errorType(res)).toBe('global_daily_limit');
    expect((await call('GET', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    expect((await call('POST', `${MOUNT}/abc-1/abort`, TOKEN_A)).status).toBe(202);
  });

  it('안전선에 막힌 메시지는 사용자 횟수를 쓰지 않는다', async () => {
    store.setNeurons('2026-11-06', GLOBAL_DAILY_NEURON_LIMIT);
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT; i++) await call('POST', `${MOUNT}/abc-1`, TOKEN_A);
    now = new Date('2026-11-06T23:59:59Z');
    store.setNeurons('2026-11-06', 0);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });

  it('다음 날이면 안전선이 풀린다', async () => {
    store.setNeurons('2026-11-06', GLOBAL_DAILY_NEURON_LIMIT);
    now = new Date('2026-11-07T00:00:00Z');
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });
});
