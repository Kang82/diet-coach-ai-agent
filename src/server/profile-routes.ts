// 저장한 프로필 (T6-2, 스펙 5장). 첫 화면 분기가 불러오고, "저장한 프로필 지우기"가 지운다.
// 토큰으로 사용자를 확인한다. 메시지가 아니라서 하루 횟수에는 들어가지 않는다.
import { Hono, type Context } from 'hono';
import { errorBody } from '../core/guard.ts';
import { resultFromProfile } from '../core/profile-store.ts';
import type { GuardStore } from '../storage/guard-store.ts';
import type { Storage } from '../storage/storage.ts';
import { authenticate } from './guard.ts';

export interface ProfileRouteOptions {
  getGuardStore: (c: Context) => GuardStore;
  getStorage: (c: Context) => Storage;
}

export function profileRoutes(options: ProfileRouteOptions) {
  const routes = new Hono();

  /** 저장한 프로필의 인터뷰 결과 { result } 또는 null */
  routes.get('/', async (c) => {
    const userId = await authenticate(c, options.getGuardStore(c));
    if (!userId) return c.json(errorBody('unauthorized'), 401);
    const profile = await options.getStorage(c).getProfile(userId);
    return c.json(profile ? { result: resultFromProfile(profile) } : null);
  });

  /** 프로필과 식단표를 모두 지운다 */
  routes.delete('/', async (c) => {
    const userId = await authenticate(c, options.getGuardStore(c));
    if (!userId) return c.json(errorBody('unauthorized'), 401);
    await options.getStorage(c).deleteUser(userId);
    return c.body(null, 204);
  });

  return routes;
}
