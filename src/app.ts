import './agents/provider.ts';
import { instrument } from '@flue/runtime';
import { createCloudflareTracing } from '@flue/runtime/cloudflare';
import { createAgentRouter } from '@flue/runtime/routing';
import { getAgentByName } from 'agents';
import { Hono } from 'hono';
import { DietCoach } from './agents/diet-coach.ts';
import type { Wipeable } from './agents/wipe-extension.ts';
import { guardAgentRoutes, meHandler } from './server/guard.ts';
import { profileRoutes } from './server/profile-routes.ts';
import { D1Storage, type D1Like } from './storage/d1-storage.ts';
import { D1GuardStore } from './storage/guard-store.ts';

// Workers Traces에 대화 내용(인터뷰 답, 복용약, 프로필 프롬프트, 식단표)을 남기지 않는다 (배포 전 보안 리뷰, 2026-11-07).
// Flue 기본 트레이싱은 입력·출력 메시지와 도구 인자·결과를 span에 담는다. 시간·토큰 수 같은 span은 그대로 남는다.
// 기본 설치보다 먼저 등록해야 해서 app.ts 모듈 범위에 둔다 (docs/guide/cloudflare-target.md createCloudflareTracing)
instrument(createCloudflareTracing({ content: false }));

const AGENT_MOUNT = '/agents/diet-coach';

type Env = { Bindings: { DB: D1Like; FLUE_DIET_COACH_AGENT: unknown } };
const app = new Hono<Env>();

// 스펙 11.4 한도 보호. 토큰, 대화 소유, 사용자 하루 횟수, 전체 Neuron 안전선 (src/server/guard.ts)
const guard = { getStore: (c: { env: { DB: D1Like } }) => new D1GuardStore(c.env.DB) };
app.use(`${AGENT_MOUNT}/*`, guardAgentRoutes(AGENT_MOUNT, guard));
app.route(AGENT_MOUNT, createAgentRouter(DietCoach));
app.get('/api/me', meHandler(guard));
// 저장한 프로필 불러오기, 내 기록(프로필·식단표·대화) 지우기 (T6-2, T15)
app.route(
  '/api/profile',
  profileRoutes({
    getGuardStore: guard.getStore,
    getStorage: (c) => new D1Storage((c.env as { DB: D1Like }).DB),
    // 대화 기록 지우기 (T15). Flue와 같은 방법(getAgentByName, @flue/vite)으로 대화 DO를 찾아 wipe-extension.ts의 메서드를 부른다
    getWipeOne: (c) => async (conversationId) => {
      const namespace = (c.env as Env['Bindings']).FLUE_DIET_COACH_AGENT;
      const stub = (await getAgentByName(namespace as never, conversationId)) as unknown as Wipeable;
      await stub.wipeConversation();
    },
  }),
);
app.get('/api/ping', (c) => c.text('pong'));

export default app;
