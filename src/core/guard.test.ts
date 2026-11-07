import { describe, expect, it } from 'vitest';
import { errorBody, hashToken, isMessagePost, neuronWindowStart, ownsConversation, utcDay, utcHour } from './guard.ts';

describe('hashToken', () => {
  it('원문과 다른 64자리 hex이고, 같은 입력은 같은 해시', async () => {
    const hash = await hashToken('secret-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('secret-token');
    expect(await hashToken('secret-token')).toBe(hash);
    expect(await hashToken('secret-token2')).not.toBe(hash);
  });
});

describe('utcDay', () => {
  it('한국 오전 8:59까지는 전날, 9:00부터 새 날 (00:00 UTC 초기화)', () => {
    expect(utcDay(new Date('2026-11-07T08:59:59+09:00'))).toBe('2026-11-06');
    expect(utcDay(new Date('2026-11-07T09:00:00+09:00'))).toBe('2026-11-07');
  });
});

describe('utcHour', () => {
  it('UTC 시간 칸. 한국 오전 8:59는 전날 23시 칸', () => {
    expect(utcHour(new Date('2026-11-07T08:59:59+09:00'))).toBe('2026-11-06T23');
    expect(utcHour(new Date('2026-11-07T09:00:00+09:00'))).toBe('2026-11-07T00');
  });
});

describe('neuronWindowStart', () => {
  it('24시간 전 시각이 속한 칸 (지금 칸 포함 25칸)', () => {
    expect(neuronWindowStart(new Date('2026-11-07T01:30:00Z'))).toBe('2026-11-06T01');
    expect(neuronWindowStart(new Date('2026-11-07T00:00:00Z'))).toBe('2026-11-06T00');
  });
});

describe('ownsConversation', () => {
  it('"<userId>-"로 시작하는 대화만 내 것', () => {
    expect(ownsConversation('abc', 'abc-1234')).toBe(true);
    expect(ownsConversation('abc', 'abcd-1234')).toBe(false);
    expect(ownsConversation('abc', 'ab-1234')).toBe(false);
    expect(ownsConversation('abc', 'abc-')).toBe(false);
    expect(ownsConversation('abc', '1234')).toBe(false);
  });
});

describe('isMessagePost', () => {
  it('대화 주소 POST만 메시지다 (abort, 읽기는 아님)', () => {
    expect(isMessagePost('POST', [])).toBe(true);
    expect(isMessagePost('POST', ['abort'])).toBe(false);
    expect(isMessagePost('GET', [])).toBe(false);
  });
});

describe('errorBody', () => {
  it('Flue 에러 봉투 모양', () => {
    expect(errorBody('unauthorized')).toEqual({
      error: { type: 'unauthorized', message: expect.any(String), details: '' },
    });
  });
});
