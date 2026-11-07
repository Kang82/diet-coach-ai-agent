// 스펙 11.4 한도 보호 미들웨어. app.ts에서 에이전트 라우터 앞에 둔다.
// 순서: 토큰 → 대화 소유 → (새 메시지만) 전체 안전선 → 사용자 하루 횟수.
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
  neuronWindowStart,
  ownsConversation,
  USER_DAILY_MESSAGE_LIMIT,
  utcDay,
} from '../core/guard.ts';
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
      const at = now();
      // 전체 안전선은 최근 24시간 합계, 사용자 횟수는 날짜(UTC) 기준 (tasks.md T7-5)
      if ((await store.neuronsSince(neuronWindowStart(at))) >= GLOBAL_DAILY_NEURON_LIMIT) {
        return c.json(errorBody('global_daily_limit'), 429);
      }
      if (!(await store.tryCountMessage(userId, utcDay(at), USER_DAILY_MESSAGE_LIMIT))) {
        return c.json(errorBody('user_daily_limit'), 429);
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
