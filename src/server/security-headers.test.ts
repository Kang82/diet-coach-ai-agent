// T22-2: Worker가 먼저 처리하는 /api/*, /agents/* 응답에도 보안 헤더를 붙인다 (화면은 public/_headers)
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { apiSecurityHeaders } from './security-headers.ts';

function appWith() {
  const app = new Hono();
  app.use('*', apiSecurityHeaders());
  app.get('/json', (c) => c.json({ ok: true }));
  app.get('/error', (c) => c.json({ error: 1 }, 401));
  // 에이전트 라우터처럼 직접 만든 스트림 응답
  app.get('/stream', () => new Response(new ReadableStream({ start: (ctl) => (ctl.enqueue(new TextEncoder().encode('data: 1\n\n')), ctl.close()) }), { headers: { 'content-type': 'text/event-stream' } }));
  // Durable Object stub에서 온 응답처럼 헤더를 바꿀 수 없는 응답 (preview에서 500이 났다)
  app.get('/immutable', () => Response.redirect('http://localhost/next', 302));
  return app;
}

describe('apiSecurityHeaders', () => {
  it.each(['/json', '/error', '/stream', '/immutable'])('%s: Referer 안 보냄, nosniff, 다른 사이트에 끼우기 금지', async (path) => {
    const res = await appWith().request(path);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it('스트림 본문과 content-type은 그대로', async () => {
    const res = await appWith().request('/stream');
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await res.text()).toBe('data: 1\n\n');
  });

  it('헤더를 바꿀 수 없는 응답은 복사해서 붙이고, 상태와 위치는 그대로', async () => {
    const res = await appWith().request('/immutable');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/next');
  });
});
