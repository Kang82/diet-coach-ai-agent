// T24: 초대 코드로 개인 토큰 받기 (POST /api/register)
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorBody, hashToken } from '../core/guard.ts';
import {
  INVITE_DAILY_USES_PER_CODE,
  REGISTER_DAILY_ATTEMPTS_PER_IP,
  REGISTER_DAILY_ATTEMPTS_TOTAL,
} from '../core/registration.ts';
import { MemoryGuardStore } from '../storage/guard-store.ts';
import { meHandler } from './guard.ts';
import { registerRoutes } from './register-routes.ts';

const CODE = 'ABCDEFGHJK12';
const SPENT = 'ZZZZZZZZZZZZ';
const BIG = 'BBBBBBBBBBBB';

let store: MemoryGuardStore;
let now: Date;
let app: Hono;

beforeEach(async () => {
  store = new MemoryGuardStore(
    [],
    [
      { codeHash: await hashToken(CODE), maxUses: 2 },
      { codeHash: await hashToken(SPENT), maxUses: 1, used: 1 },
      { codeHash: await hashToken(BIG), maxUses: 30 },
    ],
  );
  now = new Date('2026-11-10T12:00:00Z');
  app = new Hono();
  app.route('/api/register', registerRoutes({ getGuardStore: () => store, now: () => now }));
  app.get('/api/me', meHandler({ getStore: () => store }));
});

function register(body: unknown, ip = '203.0.113.7') {
  return app.request('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/register', () => {
  it('맞는 코드면 토큰과 사용자 ID를 주고, 그 토큰으로 /api/me가 같은 사용자를 돌려준다', async () => {
    const res = await register({ code: CODE });
    expect(res.status).toBe(200);
    const { token, userId } = (await res.json()) as { token: string; userId: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(userId).toMatch(/^[0-9a-f]{16}$/);
    const me = await app.request('/api/me', { headers: { authorization: `Bearer ${token}` } });
    expect(await me.json()).toEqual({ userId });
    expect(store.inviteUsed(await hashToken(CODE))).toBe(1);
  });

  it('입력 모양(소문자·하이픈·공백)이 달라도 같은 코드로 본다', async () => {
    expect((await register({ code: ' abcd-efgh-jk12 ' })).status).toBe(200);
  });

  it('틀린 코드와 다 쓴 코드는 같은 400 응답이고 코드를 쓰지 않는다', async () => {
    const wrong = await register({ code: 'ABCDEFGHJK13' });
    const spent = await register({ code: SPENT });
    expect(wrong.status).toBe(400);
    expect(spent.status).toBe(400);
    expect(await wrong.json()).toEqual(errorBody('invalid_invite'));
    expect(await spent.json()).toEqual(errorBody('invalid_invite'));
    expect(store.inviteUsed(await hashToken(CODE))).toBe(0);
  });

  it('코드는 상한까지만 쓰인다', async () => {
    expect((await register({ code: CODE }, '1.1.1.1')).status).toBe(200);
    expect((await register({ code: CODE }, '1.1.1.2')).status).toBe(200);
    expect((await register({ code: CODE }, '1.1.1.3')).status).toBe(400);
  });

  it('본문이 JSON이 아니거나 code가 없거나 1KB를 넘으면 400', async () => {
    expect((await register('not json')).status).toBe(400);
    expect((await register({})).status).toBe(400);
    expect((await register({ code: CODE, pad: 'x'.repeat(2000) })).status).toBe(400);
  });

  it(`같은 IP는 하루 ${REGISTER_DAILY_ATTEMPTS_PER_IP}번까지 시도하고(실패도 센다) 그다음은 429`, async () => {
    for (let i = 0; i < REGISTER_DAILY_ATTEMPTS_PER_IP; i++) {
      expect((await register({ code: 'WRONGWRONG00' })).status).toBe(400);
    }
    const blocked = await register({ code: CODE });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual(errorBody('register_limit'));
    expect(store.inviteUsed(await hashToken(CODE))).toBe(0);
  });

  it('다른 IP는 따로 세고, 다음 날(UTC)에는 다시 시도할 수 있다', async () => {
    for (let i = 0; i < REGISTER_DAILY_ATTEMPTS_PER_IP; i++) await register('x');
    expect((await register({ code: CODE })).status).toBe(429);
    expect((await register({ code: CODE }, '198.51.100.1')).status).toBe(200);
    now = new Date('2026-11-11T00:00:00Z');
    expect((await register({ code: CODE })).status).toBe(200);
  });

  it('같은 IPv6 /64는 주소가 달라도 한 묶음으로 센다', async () => {
    for (let i = 0; i < REGISTER_DAILY_ATTEMPTS_PER_IP; i++) await register('x', `2001:db8:1:2::${i + 1}`);
    expect((await register({ code: CODE }, '2001:db8:1:2:ffff::9')).status).toBe(429);
    expect((await register({ code: CODE }, '2001:db8:1:3::1')).status).toBe(200);
  });

  it(`코드 하나는 하루 ${INVITE_DAILY_USES_PER_CODE}번까지 쓰이고 그다음은 IP가 달라도 429, 다음 날 다시 쓰인다`, async () => {
    for (let i = 0; i < INVITE_DAILY_USES_PER_CODE; i++) {
      expect((await register({ code: BIG }, `10.0.0.${i + 1}`)).status).toBe(200);
    }
    const blocked = await register({ code: BIG }, '10.0.1.1');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual(errorBody('register_limit'));
    expect(store.inviteUsed(await hashToken(BIG))).toBe(INVITE_DAILY_USES_PER_CODE);
    // 다른 코드는 따로 센다
    expect((await register({ code: CODE }, '10.0.1.2')).status).toBe(200);
    now = new Date('2026-11-11T00:00:00Z');
    expect((await register({ code: BIG }, '10.0.1.1')).status).toBe(200);
  });

  it(`전체 하루 시도는 ${REGISTER_DAILY_ATTEMPTS_TOTAL}번까지, 그다음은 처음 보는 IP도 429`, async () => {
    for (let i = 0; i < REGISTER_DAILY_ATTEMPTS_TOTAL; i++) {
      expect((await register('x', `172.16.${Math.floor(i / 250)}.${i % 250}`)).status).toBe(400);
    }
    expect((await register({ code: CODE }, '192.0.2.1')).status).toBe(429);
    expect(store.inviteUsed(await hashToken(CODE))).toBe(0);
  });

  it('IP 헤더가 없으면(로컬) 한 묶음으로 센다', async () => {
    const local = () =>
      app.request('/api/register', { method: 'POST', body: JSON.stringify({ code: 'WRONGWRONG00' }) });
    for (let i = 0; i < REGISTER_DAILY_ATTEMPTS_PER_IP; i++) expect((await local()).status).toBe(400);
    expect((await local()).status).toBe(429);
  });
});
