// 스펙 11.4 마지막 문단: 토큰 없음·틀림 → 401, 사용자 제한 초과 → 429, 안전선 초과 → 새 요청 차단·진행 중 요청 허용.
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GLOBAL_DAILY_NEURON_LIMIT,
  hashToken,
  kindLimitMessage,
  MESSAGE_BODY_MAX_BYTES,
  RESERVATION_TTL_MS,
  RESERVE_NEURONS,
  USER_DAILY_KIND_LIMITS,
  USER_DAILY_MESSAGE_LIMIT,
} from '../core/guard.ts';
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

describe('메시지 본문 검사 (배포 전 보안 리뷰)', () => {
  const post = (body: string) =>
    app.request(`${MOUNT}/abc-1`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN_A}` }, body });

  it('보통 메시지는 통과하고 에이전트가 본문을 그대로 읽는다', async () => {
    let seen = '';
    app = new Hono();
    app.use(`${MOUNT}/*`, guardAgentRoutes(MOUNT, { getStore: () => store, now: () => now }));
    app.post(`${MOUNT}/*`, async (c) => {
      seen = await c.req.text();
      return c.text('agent', 202);
    });
    const body = JSON.stringify({ kind: 'user', body: '식단표 만들기:\n{"overrides":[]}' });
    expect((await post(body)).status).toBe(202);
    expect(seen).toBe(body);
  });

  it('상한을 넘으면 413, 첨부·signal은 400. 둘 다 횟수를 쓰지 않는다', async () => {
    const big = await post(JSON.stringify({ kind: 'user', body: 'x'.repeat(MESSAGE_BODY_MAX_BYTES) }));
    expect(big.status).toBe(413);
    expect(await errorType(big)).toBe('message_rejected');
    const attached = await post(JSON.stringify({ kind: 'user', body: 'x', attachments: [{ type: 'image', data: 'AA', mimeType: 'image/png' }] }));
    expect(attached.status).toBe(400);
    expect((await post(JSON.stringify({ kind: 'signal', type: 't', body: 'x' }))).status).toBe(400);
    expect(reached).toEqual([]);
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT; i++) expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });

  it('읽기와 abort는 본문을 보지 않는다', async () => {
    expect((await call('GET', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    expect((await call('POST', `${MOUNT}/abc-1/abort`, TOKEN_A)).status).toBe(202);
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

describe('전체 Neuron 안전선, 최근 24시간 합계 (11.4-3, tasks.md T7-5)', () => {
  it('안전선 바로 아래면 통과', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT - 1);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });

  it('여러 시간 칸을 합쳐 안전선에 닿으면 막는다', async () => {
    store.setNeurons('2026-11-05T13', GLOBAL_DAILY_NEURON_LIMIT / 2);
    store.setNeurons('2026-11-06T11', GLOBAL_DAILY_NEURON_LIMIT / 2);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(429);
  });

  it('안전선에 닿으면 새 메시지는 429, 진행 중인 대화 읽기와 abort는 통과', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT);
    const res = await call('POST', `${MOUNT}/abc-1`, TOKEN_A);
    expect(res.status).toBe(429);
    expect(await errorType(res)).toBe('global_daily_limit');
    expect((await call('GET', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    expect((await call('POST', `${MOUNT}/abc-1/abort`, TOKEN_A)).status).toBe(202);
  });

  it('안전선에 막힌 메시지는 사용자 횟수를 쓰지 않는다', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT);
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT; i++) await call('POST', `${MOUNT}/abc-1`, TOKEN_A);
    now = new Date('2026-11-06T23:59:59Z');
    store.setNeurons('2026-11-06T12', 0);
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });

  it('UTC 날짜가 바뀌어도 24시간 안에 쓴 양이면 계속 막는다', async () => {
    store.setNeurons('2026-11-06T23', GLOBAL_DAILY_NEURON_LIMIT);
    now = new Date('2026-11-07T01:00:00Z');
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(429);
  });

  it('그 칸이 창(24시간 전 시각이 속한 칸부터)을 벗어나면 풀린다', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT);
    now = new Date('2026-11-07T12:59:59Z'); // 창 시작 2026-11-06T12: 아직 막힘
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(429);
    now = new Date('2026-11-07T13:00:00Z'); // 창 시작 2026-11-06T13
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
  });
});

// B13(T10-3): 종류별 하루 횟수. 접두어로 종류를 가린다(core/message-kind.ts)
describe('종류별 하루 횟수 (T10-3)', () => {
  const send = (body: string, conversation = 'abc-1') =>
    app.request(`${MOUNT}/${conversation}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      body: JSON.stringify({ kind: 'user', body }),
    });
  const PLAN = '식단표 만들기:\n{"overrides":[]}';
  const EDIT = '칸 다시 추천: 화요일 점심\n원하는 점: 다른 걸로';
  const CLASSIFY = '메뉴 분류 요청:\n{"events":[]}';

  it(`만들기는 하루 ${USER_DAILY_KIND_LIMITS.plan}번, 넘으면 429이고 30회 카운터는 쓰지 않는다`, async () => {
    for (let i = 0; i < USER_DAILY_KIND_LIMITS.plan; i++) expect((await send(PLAN)).status).toBe(202);
    const res = await send(PLAN);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { type: string; message: string } };
    expect(body.error).toMatchObject({ type: 'user_kind_limit', message: kindLimitMessage('plan') });
    // 30회 중 5회만 썼다
    for (let i = 0; i < USER_DAILY_MESSAGE_LIMIT - USER_DAILY_KIND_LIMITS.plan; i++) {
      expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(202);
    }
    expect((await call('POST', `${MOUNT}/abc-1`, TOKEN_A)).status).toBe(429);
  });

  it('칸 수정·분류도 각자 상한이 있고, 서로와 만들기에 영향을 주지 않는다', async () => {
    for (let i = 0; i < USER_DAILY_KIND_LIMITS.edit; i++) expect((await send(EDIT)).status).toBe(202);
    expect((await send(EDIT)).status).toBe(429);
    for (let i = 0; i < USER_DAILY_KIND_LIMITS.classify; i++) expect((await send(CLASSIFY)).status).toBe(202);
    expect((await send(CLASSIFY)).status).toBe(429);
    expect((await send(PLAN)).status).toBe(202);
  });

  it('인터뷰 제출과 자유 문장은 종류 횟수와 예약이 없다', async () => {
    for (let i = 0; i < USER_DAILY_KIND_LIMITS.plan + 1; i++) expect((await send('식단표 만들어 줘')).status).toBe(202);
    expect((await send('인터뷰 제출:\n{}')).status).toBe(202);
    expect(store.reservationOf('abc-1')).toBeUndefined();
  });

  it('다음 날(00:00 UTC)이면 다시 만들 수 있다', async () => {
    for (let i = 0; i < USER_DAILY_KIND_LIMITS.plan; i++) await send(PLAN);
    expect((await send(PLAN)).status).toBe(429);
    now = new Date('2026-11-07T00:00:00Z');
    expect((await send(PLAN)).status).toBe(202);
  });
});

// B13(T10-4): 비싼 메시지는 최악의 양을 예약하고, 안전선은 합계 + 예약 + 이번 예약량으로 본다
describe('진행 중 예약 (T10-4)', () => {
  const send = (body: string, conversation = 'abc-1') =>
    app.request(`${MOUNT}/${conversation}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      body: JSON.stringify({ kind: 'user', body }),
    });
  const PLAN = '식단표 만들기:\n{"overrides":[]}';

  it('만들기를 받으면 대화 ID로 예약하고, 만료는 제출 복구 한도 뒤', async () => {
    expect((await send(PLAN)).status).toBe(202);
    expect(store.reservationOf('abc-1')).toEqual({
      neurons: RESERVE_NEURONS.plan,
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
    });
  });

  it('합계 + 이번 예약량이 안전선을 넘으면 429, 넘지 않으면 통과', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT - RESERVE_NEURONS.plan + 1);
    const res = await send(PLAN);
    expect(res.status).toBe(429);
    expect(await errorType(res)).toBe('global_daily_limit');
    expect(store.reservationOf('abc-1')).toBeUndefined();
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT - RESERVE_NEURONS.plan);
    expect((await send(PLAN)).status).toBe(202);
  });

  it('다른 대화의 진행 중 예약도 더한다. 만료된 예약은 빼고 본다', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT - 2 * RESERVE_NEURONS.plan);
    expect((await send(PLAN, 'abc-1')).status).toBe(202);
    expect((await send(PLAN, 'abc-2')).status).toBe(202);
    expect((await send(PLAN, 'abc-3')).status).toBe(429);
    now = new Date(now.getTime() + RESERVATION_TTL_MS);
    expect((await send(PLAN, 'abc-3')).status).toBe(202);
  });

  it('같은 대화에 다시 보내면 예약을 덮어써 두 번 세지 않는다', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT - RESERVE_NEURONS.plan - 1);
    expect((await send(PLAN)).status).toBe(202);
    // 이 대화 예약(1,200)을 빼고 보면 아직 1 남았다
    expect((await send(PLAN)).status).toBe(202);
  });

  it('안전선 아래에서 인터뷰·자유 문장은 예약 합계와 관계없이 지금처럼 합계만 본다', async () => {
    store.setNeurons('2026-11-06T12', GLOBAL_DAILY_NEURON_LIMIT - 1);
    await store.reserve('abc-9', 5_000, '2026-11-06T13:00:00.000Z');
    expect((await send('식단표 만들어 줘')).status).toBe(202);
  });

  it('에이전트가 받지 않으면(202가 아님) 예약을 지운다', async () => {
    app = new Hono();
    app.use(`${MOUNT}/*`, guardAgentRoutes(MOUNT, { getStore: () => store, now: () => now }));
    app.post(`${MOUNT}/*`, (c) => c.json({ error: 'bad' }, 400));
    expect((await send(PLAN)).status).toBe(400);
    expect(store.reservationOf('abc-1')).toBeUndefined();
  });

  it('종류 횟수에서 막히면 예약하지 않는다', async () => {
    for (let i = 0; i < USER_DAILY_KIND_LIMITS.plan; i++) await send(PLAN, `abc-${i}`);
    expect((await send(PLAN, 'abc-x')).status).toBe(429);
    expect(store.reservationOf('abc-x')).toBeUndefined();
  });
});

describe('대화 기록 (T15 대화 기록 지우기)', () => {
  const post = (conversation: string, body: string, token = TOKEN_A) =>
    app.request(`${MOUNT}/${conversation}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: 'user', body }),
    });

  it('에이전트로 넘긴 메시지는 그 대화를 사용자 대화로 기록한다 (보통·비싼 메시지 모두)', async () => {
    expect((await post('abc-1', '안녕하세요')).status).toBe(202);
    expect((await post('abc-2', '식단표 만들기:\n{"overrides":[]}')).status).toBe(202);
    expect((await post('abc-1', '다시')).status).toBe(202);
    expect(await store.conversationsOf('abc')).toEqual(['abc-1', 'abc-2']);
  });

  it('막힌 요청과 읽기·abort는 기록하지 않는다', async () => {
    await call('GET', `${MOUNT}/abc-1`, TOKEN_A);
    await call('POST', `${MOUNT}/abc-1/abort`, TOKEN_A);
    await post('abc-2', 'x', 'wrong'); // 401
    await post('xyz-1', 'x'); // 403
    await app.request(`${MOUNT}/abc-3`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      body: JSON.stringify({ kind: 'signal', type: 't', body: 'x' }),
    }); // 400
    store.setNeurons('2026-11-06T11', GLOBAL_DAILY_NEURON_LIMIT);
    expect((await post('abc-4', 'x')).status).toBe(429);
    expect(await store.conversationsOf('abc')).toEqual([]);
  });
});
