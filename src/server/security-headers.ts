// API·에이전트 응답 보안 헤더 (tasks.md T22-2, 2차 리뷰 낮음).
// 화면(정적 자산)은 public/_headers가 맡는다. /api/*, /agents/*는 Worker가 먼저 처리해 그 파일이 적용되지 않아 여기서 붙인다.
// 응답은 JSON과 스트림뿐이라 CSP는 아무것도 불러오지 않게 둔다.
// hono/secure-headers는 쓰지 않는다: 에이전트 라우터가 돌려주는 Durable Object 응답은 헤더를 바꿀 수 없어
// "Can't modify immutable headers"로 500이 났다(vite preview에서 확인). 그런 응답은 복사해서 붙인다.
import type { MiddlewareHandler } from 'hono';

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function apiSecurityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const res = c.res;
    // WebSocket 연결 응답은 복사하면 소켓이 빠진다. 손대지 않는다
    if (res.status === 101 || (res as { webSocket?: unknown }).webSocket) return;
    try {
      setAll(res.headers);
    } catch {
      // Hono의 c.res 설정은 새 Response로 복사하고 앞 응답의 헤더를 옮긴다. 그 복사본은 헤더를 바꿀 수 있다
      c.res = new Response(res.body, res);
      setAll(c.res.headers);
    }
  };
}

function setAll(headers: Headers): void {
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) headers.set(name, value);
}
