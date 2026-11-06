import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { DietCoach } from './agents/diet-coach.ts';
import { guardAgentRoutes, meHandler } from './server/guard.ts';
import type { D1Like } from './storage/d1-storage.ts';
import { D1GuardStore } from './storage/guard-store.ts';

const AGENT_MOUNT = '/agents/diet-coach';

const app = new Hono<{ Bindings: { DB: D1Like } }>();

// 스펙 11.4 한도 보호. 토큰, 대화 소유, 사용자 하루 횟수, 전체 Neuron 안전선 (src/server/guard.ts)
const guard = { getStore: (c: { env: { DB: D1Like } }) => new D1GuardStore(c.env.DB) };
app.use(`${AGENT_MOUNT}/*`, guardAgentRoutes(AGENT_MOUNT, guard));
app.route(AGENT_MOUNT, createAgentRouter(DietCoach));
app.get('/api/me', meHandler(guard));
app.get('/api/ping', (c) => c.text('pong'));

export default app;
