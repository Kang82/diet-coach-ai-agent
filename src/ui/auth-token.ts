// 사용자 링크 토큰 (스펙 11.4-1, B8). 링크 `/?t=<토큰>`로 들어오면 이 브라우저에 두고 주소창에서 지운다.
// 주소창에 남으면 화면 공유나 방문 기록으로 새기 때문이다. 다음부터는 저장한 토큰을 쓴다.
import { TOKEN_KEY, type KeyValueStore } from './browser-store.ts';

export const TOKEN_PARAM = 't';

export interface UrlPort {
  href: string;
  replace: (href: string) => void;
}

/** 주소의 토큰을 저장하고 주소에서 지운 뒤 토큰을 돌려준다. 주소에 없으면 저장한 토큰, 둘 다 없으면 undefined */
export function takeToken(url: UrlPort, store: KeyValueStore | undefined): string | undefined {
  const parsed = new URL(url.href);
  const fromUrl = parsed.searchParams.get(TOKEN_PARAM)?.trim();
  if (fromUrl) {
    try {
      store?.setItem(TOKEN_KEY, fromUrl);
    } catch {
      // 저장소를 못 쓰면 이번 창에서만 쓴다
    }
    parsed.searchParams.delete(TOKEN_PARAM);
    url.replace(parsed.pathname + parsed.search + parsed.hash);
    return fromUrl;
  }
  try {
    return store?.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** 브라우저 주소창 */
export function browserUrl(): UrlPort {
  return {
    href: location.href,
    replace: (href) => history.replaceState(history.state, '', href),
  };
}
