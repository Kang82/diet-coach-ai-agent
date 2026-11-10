// 저장한 프로필 (T6-2, 스펙 5장). 첫 화면 분기가 불러오고, "내 기록 모두 지우기"가 지운다.
// 지울 때는 대화 기록(Durable Object)도 지운다 (T15, conversation-wipe.ts).
// 토큰으로 사용자를 확인한다. 메시지가 아니라서 하루 횟수에는 들어가지 않는다.
import { Hono, type Context } from 'hono';
import { errorBody } from '../core/guard.ts';
import { resultFromProfile } from '../core/profile-store.ts';
import type { GuardStore } from '../storage/guard-store.ts';
import type { Storage } from '../storage/storage.ts';
import { wipeUserConversations, type WipeOne } from './conversation-wipe.ts';
import { authenticate } from './guard.ts';

export interface ProfileRouteOptions {
  getGuardStore: (c: Context) => GuardStore;
  getStorage: (c: Context) => Storage;
  /** 대화 하나(DO)를 지우는 함수 (app.ts가 getAgentByName으로 만든다) */
  getWipeOne: (c: Context) => WipeOne;
  /** 테스트용 */
  now?: () => Date;
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

  /**
   * 프로필·식단표(D1)와 기록된 대화(DO)를 모두 지운다. 저장 동의와 관계없다(동의하지 않았으면 D1에 지울 것이 없을 뿐).
   * { failed }: 못 지운 대화 수. 그 대화는 기록에 남아 다시 누르면 다시 지운다.
   * 같은 사용자의 비싼 요청(만들기·분류·칸 수정)이 진행 중이면(예약, key는 사용자 ID) 409 busy로 아무것도 지우지 않는다.
   * 지운 뒤 도는 도구가 식단표를 다시 저장하거나 대화 기록을 남기지 않게 한다 (T22-4)
   */
  routes.delete('/', async (c) => {
    const guardStore = options.getGuardStore(c);
    const userId = await authenticate(c, guardStore);
    if (!userId) return c.json(errorBody('unauthorized'), 401);
    const now = (options.now ?? (() => new Date()))().toISOString();
    if (await guardStore.hasActiveReservation(userId, now)) return c.json(errorBody('busy'), 409);
    await options.getStorage(c).deleteUser(userId);
    // 먹었어요 체크 (T25). 저장 동의와 관계없이 남기므로 함께 지운다
    await guardStore.deleteChecksOf(userId);
    const { failed } = await wipeUserConversations(guardStore, userId, options.getWipeOne(c));
    return c.json({ failed });
  });

  return routes;
}
