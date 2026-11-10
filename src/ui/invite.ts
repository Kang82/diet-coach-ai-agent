// 초대 코드로 개인 토큰 받기 (tasks.md T24). 링크 `/?invite=<코드>`로 들어오면 코드를 꺼내고 주소창에서 지운다.
// 받은 토큰은 auth-token.ts와 같은 키에 두고, 다른 기기에서 열 수 있게 개인 링크(`/?t=<토큰>`)를 보여 준다.
import { TOKEN_PARAM, type UrlPort } from './auth-token.ts';
import { TOKEN_KEY, type KeyValueStore } from './browser-store.ts';

export const INVITE_PARAM = 'invite';

/** 주소의 초대 코드를 꺼내고 주소에서 지운다. 없으면 undefined */
export function takeInvite(url: UrlPort): string | undefined {
  const parsed = new URL(url.href);
  if (!parsed.searchParams.has(INVITE_PARAM)) return undefined;
  const code = parsed.searchParams.get(INVITE_PARAM)?.trim();
  parsed.searchParams.delete(INVITE_PARAM);
  url.replace(parsed.pathname + parsed.search + parsed.hash);
  return code || undefined;
}

/** 다른 기기·브라우저에서 같은 사용자로 열 링크 */
export function personalLink(origin: string, token: string): string {
  const link = new URL('/', origin);
  link.searchParams.set(TOKEN_PARAM, token);
  return link.href;
}

export type RegisterResult =
  | { kind: 'ok'; token: string; userId: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed' };

/** POST /api/register. 400·429는 서버 문구를 그대로 보여 준다 */
export async function registerWithInvite(code: string, fetcher: typeof fetch = fetch): Promise<RegisterResult> {
  try {
    const res = await fetcher('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = (await res.json().catch(() => null)) as
      | { token?: unknown; userId?: unknown; error?: { message?: unknown } }
      | null;
    if (res.ok && typeof body?.token === 'string' && typeof body.userId === 'string') {
      return { kind: 'ok', token: body.token, userId: body.userId };
    }
    if ((res.status === 400 || res.status === 429) && typeof body?.error?.message === 'string') {
      return { kind: 'rejected', message: body.error.message };
    }
    return { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

/** 받은 토큰을 이 브라우저에 둔다. 못 쓰는 환경이면 false(이번 창에서만 쓴다, 화면이 링크 저장을 권한다) */
export function saveToken(token: string, store: KeyValueStore | undefined): boolean {
  if (!store) return false;
  try {
    store.setItem(TOKEN_KEY, token);
    return store.getItem(TOKEN_KEY) === token;
  } catch {
    return false;
  }
}
