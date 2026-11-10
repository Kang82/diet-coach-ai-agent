// 초대 코드로 개인 토큰 받기 (tasks.md T24, 스펙 11.4-1). POST /api/register { code } → { token, userId }
// 순서: 전체 하루 시도 수 → IP 묶음 하루 시도 수(성공·실패 모두 센다) → 본문 검사 → 코드 하루 사용 수 → 코드 사용과 사용자 만들기.
// 전체 상한이 먼저라 주소를 바꿔 가며 불러도 하루 D1 쓰기가 상한 근처에서 멈춘다 (리뷰 반영 T24-6).
// 틀린 코드와 다 쓴 코드는 같은 응답(400 invalid_invite)이라 코드가 있는지 알려 주지 않는다.
// 토큰 원문은 응답으로 한 번만 나가고 저장소에는 해시만 남는다.
import { Hono, type Context } from 'hono';
import { errorBody, hashToken, utcDay } from '../core/guard.ts';
import {
  INVITE_DAILY_USES_PER_CODE,
  inviteDailyKey,
  newCredentials,
  parseRegisterBody,
  REGISTER_BODY_MAX_BYTES,
  REGISTER_DAILY_ATTEMPTS_PER_IP,
  REGISTER_DAILY_ATTEMPTS_TOTAL,
  REGISTER_TOTAL_KEY,
  registerIpKey,
} from '../core/registration.ts';
import type { GuardStore } from '../storage/guard-store.ts';
import { readLimited } from './guard.ts';

export interface RegisterRouteOptions {
  getGuardStore: (c: Context) => GuardStore;
  /** 테스트용 */
  now?: () => Date;
  newCredentials?: () => { token: string; userId: string };
}

export function registerRoutes(options: RegisterRouteOptions) {
  const now = options.now ?? (() => new Date());
  const credentials = options.newCredentials ?? (() => newCredentials());
  const routes = new Hono();

  routes.post('/', async (c) => {
    const store = options.getGuardStore(c);
    const at = now();
    const day = utcDay(at);
    // Cloudflare가 붙이는 접속 IP. 로컬 개발 서버에는 없어 한 묶음으로 센다
    const ip = c.req.header('cf-connecting-ip') ?? 'local';
    if (
      !(await store.tryCountRegister(REGISTER_TOTAL_KEY, day, REGISTER_DAILY_ATTEMPTS_TOTAL)) ||
      !(await store.tryCountRegister(await registerIpKey(ip, day), day, REGISTER_DAILY_ATTEMPTS_PER_IP))
    ) {
      return c.json(errorBody('register_limit'), 429);
    }

    const raw = await readLimited(c.req.raw, REGISTER_BODY_MAX_BYTES);
    const code = raw === undefined ? null : parseRegisterBody(raw);
    if (code === null) return c.json(errorBody('invalid_invite'), 400);

    const codeHash = await hashToken(code);
    // 모르는 코드도 센다(행이 생기지만 전체 상한 안이다). 코드가 있는지 응답으로 드러내지 않으려고 같은 429를 쓴다
    if (!(await store.tryCountRegister(inviteDailyKey(codeHash), day, INVITE_DAILY_USES_PER_CODE))) {
      return c.json(errorBody('register_limit'), 429);
    }

    const { token, userId } = credentials();
    const ok = await store.registerWithInvite(codeHash, {
      userId,
      tokenHash: await hashToken(token),
      at: at.toISOString(),
    });
    if (!ok) return c.json(errorBody('invalid_invite'), 400);
    return c.json({ token, userId });
  });

  return routes;
}
