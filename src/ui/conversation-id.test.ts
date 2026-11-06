import { describe, expect, it } from 'vitest';
import { conversationIdFor, newConversationId } from './conversation-id.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newConversationId', () => {
  it('randomUUID가 있으면 그것을 쓴다', () => {
    const fake = { randomUUID: () => 'from-random-uuid', getRandomValues: crypto.getRandomValues.bind(crypto) };
    expect(newConversationId(fake as unknown as Crypto)).toBe('from-random-uuid');
  });

  it('randomUUID가 없으면(https가 아닌 주소) getRandomValues로 UUID v4를 만든다', () => {
    const fake = { getRandomValues: crypto.getRandomValues.bind(crypto) };
    const id = newConversationId(fake as unknown as Crypto);
    expect(id).toMatch(UUID_V4);
    expect(newConversationId(fake as unknown as Crypto)).not.toBe(id);
  });
});

describe('conversationIdFor', () => {
  it('저장한 ID가 이 사용자 것이면 그대로', () => {
    expect(conversationIdFor('u1', 'u1-abc')).toBe('u1-abc');
  });

  it('없거나 다른 사용자, 토큰 전 UUID면 "<userId>-<UUID>"로 새로 만든다', () => {
    for (const saved of [null, 'u2-abc', 'u1x-abc', '0b0c9f3e-1111-4111-8111-111111111111']) {
      const id = conversationIdFor('u1', saved);
      expect(id.startsWith('u1-')).toBe(true);
      expect(id.slice(3)).toMatch(UUID_V4);
    }
  });
});
