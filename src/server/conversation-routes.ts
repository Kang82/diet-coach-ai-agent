// 지난 식단표 목록 (tasks.md T17, 스펙 7장). 식단표를 만들었거나 고친 이 사용자의 대화를 최근 순으로 준다.
// 화면은 항목을 누르면 그 대화로 옮겨 다시 읽는다(대화 소유는 한도 보호 미들웨어가 확인). 메시지가 아니라 하루 횟수에 세지 않는다.
import { Hono, type Context } from 'hono';
import { errorBody } from '../core/guard.ts';
import type { GuardStore } from '../storage/guard-store.ts';
import { authenticate } from './guard.ts';

export function conversationRoutes(options: { getGuardStore: (c: Context) => GuardStore }) {
  const routes = new Hono();

  routes.get('/', async (c) => {
    const store = options.getGuardStore(c);
    const userId = await authenticate(c, store);
    if (!userId) return c.json(errorBody('unauthorized'), 401);
    return c.json({ items: await store.planConversations(userId) });
  });

  return routes;
}
