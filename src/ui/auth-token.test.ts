import { describe, expect, it } from 'vitest';
import { takeToken, type UrlPort } from './auth-token.ts';
import { TOKEN_KEY } from './browser-store.ts';
import { memoryStore } from './__fixtures__/memory-store.ts';

function urlOf(href: string) {
  const replaced: string[] = [];
  const port: UrlPort = { href, replace: (h) => void replaced.push(h) };
  return { port, replaced };
}

describe('takeToken', () => {
  it('주소의 토큰을 저장하고 주소에서 지운다 (다른 값은 남긴다)', () => {
    const store = memoryStore();
    const { port, replaced } = urlOf('http://x.test/?a=1&t=tok-123#top');
    expect(takeToken(port, store)).toBe('tok-123');
    expect(store.getItem(TOKEN_KEY)).toBe('tok-123');
    expect(replaced).toEqual(['/?a=1#top']);
  });

  it('주소에 없으면 저장한 토큰을 쓰고 주소는 그대로 둔다', () => {
    const store = memoryStore();
    store.setItem(TOKEN_KEY, 'saved');
    const { port, replaced } = urlOf('http://x.test/');
    expect(takeToken(port, store)).toBe('saved');
    expect(replaced).toEqual([]);
  });

  it('주소의 새 토큰이 저장한 토큰보다 우선한다', () => {
    const store = memoryStore();
    store.setItem(TOKEN_KEY, 'old');
    expect(takeToken(urlOf('http://x.test/?t=new').port, store)).toBe('new');
    expect(store.getItem(TOKEN_KEY)).toBe('new');
  });

  it('둘 다 없으면 undefined', () => {
    expect(takeToken(urlOf('http://x.test/?t=').port, memoryStore())).toBeUndefined();
    expect(takeToken(urlOf('http://x.test/').port, undefined)).toBeUndefined();
  });
});
