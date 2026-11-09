// 스펙 11.4 한도 보호 미들웨어. app.ts에서 에이전트 라우터 앞에 둔다.
// 순서: 토큰 → 대화 소유 → (새 메시지만) 본문 검사(접두어 없는 메시지 거절, T19-6) → 전체 안전선
// → (비싼 종류면) 예약(사용자당 하나, 검사와 예약을 한 번에, T19-7) → 종류별 하루 횟수 → 사용자 하루 횟수. 횟수에서 막히면 예약을 지운다.
// 횟수와 안전선은 새 메시지 POST에만 건다. SDK는 대화 읽기(GET 스트림)가 429를 받으면 끝없이 다시 시도하고,
// send(POST)는 다시 시도하지 않기 때문이다. 읽기와 abort는 진행 중인 요청이라 막지 않는다.
import type { Context, MiddlewareHandler } from 'hono';
import {
  checkMessageBody,
  errorBody,
  MESSAGE_BODY_MAX_BYTES,
  GLOBAL_DAILY_NEURON_LIMIT,
  hashToken,
  isMessagePost,
  messageKindOfRaw,
  RESERVATION_TTL_MS,
  RESERVE_NEURONS,
  USER_DAILY_KIND_LIMITS,
  neuronWindowStart,
  ownsConversation,
  USER_DAILY_MESSAGE_LIMIT,
  utcDay,
} from '../core/guard.ts';
import { isExpensiveKind } from '../core/message-kind.ts';
import type { GuardStore } from '../storage/guard-store.ts';

export interface GuardOptions {
  getStore: (c: Context) => GuardStore;
  now?: () => Date;
}

/** authorization: Bearer <토큰>의 사용자 ID. 없거나 모르는 토큰이면 null */
export async function authenticate(c: Context, store: GuardStore): Promise<string | null> {
  const match = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '');
  if (!match) return null;
  return store.findUserByTokenHash(await hashToken(match[1]!));
}

export function guardAgentRoutes(mount: string, options: GuardOptions): MiddlewareHandler {
  const now = options.now ?? (() => new Date());
  return async (c, next) => {
    const store = options.getStore(c);
    const userId = await authenticate(c, store);
    if (!userId) return c.json(errorBody('unauthorized'), 401);

    const [conversationId = '', ...rest] = c.req.path.slice(mount.length + 1).split('/');
    if (!ownsConversation(userId, safeDecode(conversationId))) return c.json(errorBody('forbidden'), 403);

    if (isMessagePost(c.req.method, rest)) {
      // 본문 검사는 횟수를 쓰기 전에 한다. 원본 요청은 에이전트 라우터가 읽으므로 복사본을 상한까지만 읽는다
      const raw = await readLimited(c.req.raw, MESSAGE_BODY_MAX_BYTES);
      if (raw === undefined || checkMessageBody(raw) !== 'ok') {
        return c.json(errorBody('message_rejected'), raw === undefined ? 413 : 400);
      }
      // 화면은 모든 메시지를 접두어로 보낸다. 접두어 없는 메시지(chat)는 도구가 없어 쓸모가 없고, 32KB 문장을 쌓거나 길게 출력시켜
      // 한도를 쓰는 통로였다 (2차 보안 리뷰 T19-6)
      const kind = messageKindOfRaw(raw);
      if (kind === 'chat') return c.json(errorBody('message_rejected'), 400);
      const at = now();
      const day = utcDay(at);
      // 전체 안전선은 최근 24시간 합계, 사용자 횟수는 날짜(UTC) 기준 (tasks.md T7-5)
      const used = await store.neuronsSince(neuronWindowStart(at));
      if (used >= GLOBAL_DAILY_NEURON_LIMIT) return c.json(errorBody('global_daily_limit'), 429);

      // 비싼 메시지(분류·만들기·칸 수정): 최악의 양을 사용자 ID로 예약한다(T10-4). 검사(합계 + 진행 중 예약 + 이번 양)와 예약이
      // 한 번에 되어 동시 요청이 함께 통과하지 않고, 사용자당 하나씩만 돈다(같은 대화 연속 요청의 덮어쓰기·조기 해제도 없다) (T19-7).
      // 그다음 종류별 하루 횟수를 30회보다 먼저 센다. 종류에서 막히면 30회를 쓰지 않는다 (T10-3)
      const conversation = safeDecode(conversationId);
      if (isExpensiveKind(kind)) {
        const reserved = await store.tryReserve(userId, RESERVE_NEURONS[kind], {
          now: at.toISOString(),
          fromHour: neuronWindowStart(at),
          limit: GLOBAL_DAILY_NEURON_LIMIT,
          expiresAt: new Date(at.getTime() + RESERVATION_TTL_MS).toISOString(),
        });
        if (reserved === 'busy') return c.json(errorBody('busy'), 429);
        if (reserved === 'over_limit') return c.json(errorBody('global_daily_limit'), 429);
        if (!(await store.tryCountKind(userId, kind, day, USER_DAILY_KIND_LIMITS[kind]))) {
          await store.release(userId);
          return c.json(errorBody('user_kind_limit', kind), 429);
        }
      }
      if (!(await store.tryCountMessage(userId, day, USER_DAILY_MESSAGE_LIMIT))) {
        if (isExpensiveKind(kind)) await store.release(userId);
        return c.json(errorBody('user_daily_limit'), 429);
      }
      // 메시지가 가는 대화를 기록한다. "내 기록 모두 지우기"가 이 목록으로 대화(DO)를 지운다 (T15). DO 이름은 나열할 수 없다
      await store.recordConversation(userId, conversation, at.toISOString());
      if (isExpensiveKind(kind)) {
        // 도구가 끝나면 에이전트가 지운다(agents/usage-meter.ts). 못 지워도 만료로 풀린다
        await next();
        // 에이전트가 받지 않았으면(202가 아님) 도구가 돌지 않으니 예약을 지운다
        if (c.res.status !== 202) await store.release(userId);
        return;
      }
    }
    await next();
  };
}

/** 요청 본문 복사본을 maxBytes까지만 읽는다. 넘으면 undefined (본문 전체를 메모리에 올리지 않는다) */
async function readLimited(request: Request, maxBytes: number): Promise<string | undefined> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;
  const body = request.clone().body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      // clone()은 tee라서 한쪽 cancel은 다른 쪽(원본)도 끝나야 풀린다. 기다리지 않는다
      reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** 잘못된 %인코딩이면 빈 문자열(→ 403)로 본다 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

/** GET /api/me: 화면이 대화 ID 접두어로 쓸 사용자 ID */
export function meHandler(options: GuardOptions) {
  return async (c: Context) => {
    const userId = await authenticate(c, options.getStore(c));
    if (!userId) return c.json(errorBody('unauthorized'), 401);
    return c.json({ userId });
  };
}
