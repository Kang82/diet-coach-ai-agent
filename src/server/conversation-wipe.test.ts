// 대화 기록 지우기 (tasks.md T15). DO 부분(wipeOne)은 가짜로 바꿔 끼운다
import { describe, expect, it } from 'vitest';
import { MemoryGuardStore } from '../storage/guard-store.ts';
import { wipeUserConversations } from './conversation-wipe.ts';

async function storeWith(userId: string, ids: string[]) {
  const store = new MemoryGuardStore();
  for (const [i, id] of ids.entries()) await store.recordConversation(userId, id, `2026-11-08T0${i}:00:00.000Z`);
  await store.recordConversation('other', 'other-1', '2026-11-08T00:00:00.000Z');
  return store;
}

describe('wipeUserConversations', () => {
  it('그 사용자의 모든 대화를 지우고 기록에서 뺀다. 다른 사용자 대화는 그대로', async () => {
    const store = await storeWith('u1', ['u1-a', 'u1-b']);
    const wiped: string[] = [];

    const out = await wipeUserConversations(store, 'u1', async (id) => void wiped.push(id));

    expect(out).toEqual({ wiped: 2, failed: 0 });
    expect(wiped).toEqual(['u1-a', 'u1-b']);
    expect(await store.conversationsOf('u1')).toEqual([]);
    expect(await store.conversationsOf('other')).toEqual(['other-1']);
  });

  it('실패한 대화는 기록에 남겨 다음에 다시 지울 수 있게 한다', async () => {
    const store = await storeWith('u1', ['u1-a', 'u1-b', 'u1-c']);

    const out = await wipeUserConversations(store, 'u1', async (id) => {
      if (id === 'u1-b') throw new Error('network');
    });

    expect(out).toEqual({ wiped: 2, failed: 1 });
    expect(await store.conversationsOf('u1')).toEqual(['u1-b']);
  });

  it('isolate가 끝나며 나는 abort 에러("destroyed")는 지운 것으로 본다 (Agent.destroy)', async () => {
    const store = await storeWith('u1', ['u1-a']);

    const out = await wipeUserConversations(store, 'u1', async () => {
      throw new Error('The Durable Object was aborted: destroyed');
    });

    expect(out).toEqual({ wiped: 1, failed: 0 });
    expect(await store.conversationsOf('u1')).toEqual([]);
  });

  it('대화가 없으면 아무것도 부르지 않는다', async () => {
    const store = new MemoryGuardStore();
    let called = false;
    expect(await wipeUserConversations(store, 'u1', async () => void (called = true))).toEqual({ wiped: 0, failed: 0 });
    expect(called).toBe(false);
  });
});
