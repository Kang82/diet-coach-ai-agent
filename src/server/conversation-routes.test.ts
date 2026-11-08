// 지난 식단표 목록 (tasks.md T17)
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../core/guard.ts';
import { MemoryGuardStore } from '../storage/guard-store.ts';
import { conversationRoutes } from './conversation-routes.ts';

let store: MemoryGuardStore;
let app: Hono;

beforeEach(async () => {
  store = new MemoryGuardStore([
    { userId: 'u1', tokenHash: await hashToken('t1') },
    { userId: 'u2', tokenHash: await hashToken('t2') },
  ]);
  app = new Hono();
  app.route('/api/conversations', conversationRoutes({ getGuardStore: () => store }));
});

const get = (token?: string) =>
  app.request('/api/conversations', { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('GET /api/conversations', () => {
  it('토큰이 없거나 틀리면 401', async () => {
    expect((await get()).status).toBe(401);
    expect((await get('wrong')).status).toBe(401);
  });

  it('자기 대화 중 식단표가 있는 것만 최근 순으로', async () => {
    await store.recordConversation('u1', 'u1-a', '2026-11-08T00:00:00.000Z');
    await store.recordConversation('u1', 'u1-b', '2026-11-08T00:00:00.000Z');
    await store.recordConversation('u1', 'u1-c', '2026-11-08T00:00:00.000Z');
    await store.recordConversation('u2', 'u2-a', '2026-11-08T00:00:00.000Z');
    await store.markConversationPlan('u1-a', '2026-11-09', '2026-11-08T01:00:00.000Z');
    await store.markConversationPlan('u1-b', '2026-11-16', '2026-11-08T02:00:00.000Z');
    await store.markConversationPlan('u2-a', '2026-11-09', '2026-11-08T03:00:00.000Z');

    const res = await get('t1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        { conversationId: 'u1-b', weekStart: '2026-11-16', planAt: '2026-11-08T02:00:00.000Z' },
        { conversationId: 'u1-a', weekStart: '2026-11-09', planAt: '2026-11-08T01:00:00.000Z' },
      ],
    });
  });

  it('없으면 빈 목록', async () => {
    expect(await (await get('t2')).json()).toEqual({ items: [] });
  });
});
