import { describe, expect, it } from 'vitest';
import { newConversationId } from './conversation-id.ts';

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
