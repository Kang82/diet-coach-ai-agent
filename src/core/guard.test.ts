import { describe, expect, it } from 'vitest';
import { checkMessageBody, errorBody, hashToken, MESSAGE_BODY_MAX_BYTES, isMessagePost, neuronWindowStart, ownsConversation, utcDay, utcHour } from './guard.ts';

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

  it('접두어 뒤는 영문·숫자·하이픈 80자까지 (화면 UUID, 평가 eval-<uuid>) (T22-6)', () => {
    expect(ownsConversation('abc', 'abc-0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')).toBe(true);
    expect(ownsConversation('abc', 'abc-eval-0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')).toBe(true);
    expect(ownsConversation('abc', `abc-${'a'.repeat(80)}`)).toBe(true);
    expect(ownsConversation('abc', `abc-${'a'.repeat(81)}`)).toBe(false);
    expect(ownsConversation('abc', 'abc-x/y')).toBe(false);
    expect(ownsConversation('abc', 'abc-x%2Fy')).toBe(false);
    expect(ownsConversation('abc', 'abc-x y')).toBe(false);
    expect(ownsConversation('abc', 'abc-x.y')).toBe(false);
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

// 배포 전 보안 리뷰 (2026-11-07): 메시지 하나가 입력 토큰을 크게 키우지 못하게 한다
describe('checkMessageBody', () => {
  it('화면이 보내는 모양(kind user, body)은 통과', () => {
    expect(checkMessageBody(JSON.stringify({ kind: 'user', body: '식단표 만들기:\n{"overrides":[]}' }))).toBe('ok');
    expect(checkMessageBody(JSON.stringify({ kind: 'user', body: 'x', attachments: [] }))).toBe('ok');
  });

  it('빈 본문이나 JSON이 아닌 본문은 Flue가 400으로 거절하게 둔다', () => {
    expect(checkMessageBody('')).toBe('ok');
    expect(checkMessageBody('not json')).toBe('ok');
  });

  it(`${MESSAGE_BODY_MAX_BYTES}바이트를 넘으면 too_large (UTF-8 바이트로 잰다)`, () => {
    const body = (n: number) => JSON.stringify({ kind: 'user', body: '가'.repeat(n) });
    const overhead = new TextEncoder().encode(body(0)).length;
    const fits = Math.floor((MESSAGE_BODY_MAX_BYTES - overhead) / 3);
    expect(checkMessageBody(body(fits))).toBe('ok');
    expect(checkMessageBody(body(fits + 1))).toBe('too_large');
  });

  it('첨부, signal, initialData는 쓰지 않으므로 거절', () => {
    expect(checkMessageBody(JSON.stringify({ kind: 'user', body: 'x', attachments: [{ type: 'image' }] }))).toBe('unsupported');
    expect(checkMessageBody(JSON.stringify({ kind: 'signal', type: 't', body: 'x' }))).toBe('unsupported');
    expect(checkMessageBody(JSON.stringify({ kind: 'user', body: 'x', initialData: {} }))).toBe('unsupported');
  });
});
