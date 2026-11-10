// 식단표 칸 "먹었어요" 체크 (tasks.md T25, Task2 R2, 스펙 5장).
//   GET /api/checks/:conversationId → { checks: [{ day, meal }] }
//   PUT /api/checks/:conversationId { day, meal, eaten } → { ok: true }
// 토큰 → 대화 소유(접두어, 403) → (PUT) 본문(400) → 사용자 하루 쓰기 수(429) → 식단표 대화인지(404, 저장 문장 안에서).
// 메시지가 아니라 LLM을 부르지 않고 하루 메시지 30회에 세지 않는다.
import { Hono, type Context } from 'hono';
import { errorBody, ownsConversation, utcDay } from '../core/guard.ts';
import { CHECK_BODY_MAX_BYTES, parseCheckBody, USER_DAILY_CHECK_LIMIT } from '../core/plan-check.ts';
import type { GuardStore } from '../storage/guard-store.ts';
import { authenticate, readLimited } from './guard.ts';

export interface CheckRouteOptions {
  getGuardStore: (c: Context) => GuardStore;
  /** 테스트용 */
  now?: () => Date;
}

export function checkRoutes(options: CheckRouteOptions) {
  const now = options.now ?? (() => new Date());
  const routes = new Hono();

  routes.get('/:conversationId', async (c) => {
    const store = options.getGuardStore(c);
    const userId = await authenticate(c, store);
    if (!userId) return c.json(errorBody('unauthorized'), 401);
    const conversationId = c.req.param('conversationId');
    if (!ownsConversation(userId, conversationId)) return c.json(errorBody('forbidden'), 403);
    return c.json({ checks: await store.checksOf(userId, conversationId) });
  });

  routes.put('/:conversationId', async (c) => {
    const store = options.getGuardStore(c);
    const userId = await authenticate(c, store);
    if (!userId) return c.json(errorBody('unauthorized'), 401);
    const conversationId = c.req.param('conversationId');
    if (!ownsConversation(userId, conversationId)) return c.json(errorBody('forbidden'), 403);

    const raw = await readLimited(c.req.raw, CHECK_BODY_MAX_BYTES);
    const request = raw === undefined ? null : parseCheckBody(raw);
    if (!request) return c.json(errorBody('check_rejected'), 400);

    const at = now();
    if (!(await store.tryCountKey(`check:${userId}`, utcDay(at), USER_DAILY_CHECK_LIMIT))) {
      return c.json(errorBody('check_limit'), 429);
    }
    const { eaten, ...slot } = request;
    if (!(await store.setCheck(userId, conversationId, slot, eaten, at.toISOString()))) {
      return c.json(errorBody('check_not_found'), 404);
    }
    return c.json({ ok: true });
  });

  return routes;
}
