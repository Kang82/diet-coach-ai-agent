import { describe, expect, it } from 'vitest';
import { takeToken, type UrlPort } from './auth-token.ts';
import { TOKEN_KEY } from './browser-store.ts';
import { personalLink, registerWithInvite, saveToken, takeInvite } from './invite.ts';
import { memoryStore } from './__fixtures__/memory-store.ts';

function urlOf(href: string) {
  const replaced: string[] = [];
  const port: UrlPort = { href, replace: (h) => void replaced.push(h) };
  return { port, replaced };
}

describe('takeInvite', () => {
  it('주소의 코드를 꺼내고 주소에서 지운다 (다른 값은 남긴다)', () => {
    const { port, replaced } = urlOf('http://x.test/?a=1&invite=ABCD-EFGH-JK12#top');
    expect(takeInvite(port)).toBe('ABCD-EFGH-JK12');
    expect(replaced).toEqual(['/?a=1#top']);
  });

  it('없으면 undefined이고 주소는 그대로 둔다', () => {
    const { port, replaced } = urlOf('http://x.test/?a=1');
    expect(takeInvite(port)).toBeUndefined();
    expect(replaced).toEqual([]);
  });

  it('빈 값이면 주소에서만 지우고 undefined', () => {
    const { port, replaced } = urlOf('http://x.test/?invite=%20');
    expect(takeInvite(port)).toBeUndefined();
    expect(replaced).toEqual(['/']);
  });
});

it('personalLink는 /?t=<토큰>이고 takeToken이 그대로 읽는다', () => {
  const link = personalLink('https://diet.example', 'tok_-123');
  expect(link).toBe('https://diet.example/?t=tok_-123');
  const store = memoryStore();
  expect(takeToken(urlOf(link).port, store)).toBe('tok_-123');
});

it('saveToken은 auth-token과 같은 키에 두고, 못 쓰면 false', () => {
  const store = memoryStore();
  expect(saveToken('tok', store)).toBe(true);
  expect(store.getItem(TOKEN_KEY)).toBe('tok');
  expect(saveToken('tok', undefined)).toBe(false);
  const full = {
    ...memoryStore(),
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  expect(saveToken('tok', full)).toBe(false);
});

describe('registerWithInvite', () => {
  const respond = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('성공하면 토큰과 사용자 ID', async () => {
    let sent: RequestInit | undefined;
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent = init;
      return new Response(JSON.stringify({ token: 't', userId: 'u' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await registerWithInvite('abcd', fetcher)).toEqual({ kind: 'ok', token: 't', userId: 'u' });
    expect(sent?.method).toBe('POST');
    expect(JSON.parse(String(sent?.body))).toEqual({ code: 'abcd' });
  });

  it('400·429는 서버 문구를 그대로', async () => {
    const error = { error: { type: 'invalid_invite', message: '맞지 않아요', details: '' } };
    expect(await registerWithInvite('x', respond(400, error))).toEqual({ kind: 'rejected', message: '맞지 않아요' });
    expect(await registerWithInvite('x', respond(429, error))).toEqual({ kind: 'rejected', message: '맞지 않아요' });
  });

  it('그 밖의 상태, 모양이 틀린 응답, 네트워크 실패는 failed', async () => {
    expect(await registerWithInvite('x', respond(500, {}))).toEqual({ kind: 'failed' });
    expect(await registerWithInvite('x', respond(200, { token: 1 }))).toEqual({ kind: 'failed' });
    const offline = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await registerWithInvite('x', offline)).toEqual({ kind: 'failed' });
  });
});
