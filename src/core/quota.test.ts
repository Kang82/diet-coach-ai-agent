// 스펙 11.3. isQuotaExceeded는 임시 구현이다 (열린 질문 6). 실제 에러를 본 뒤 케이스를 고친다.
import { describe, expect, it } from 'vitest';
import { isQuotaExceeded, QuotaExceededError } from './quota.ts';

describe('isQuotaExceeded', () => {
  it('QuotaExceededError', () => {
    expect(isQuotaExceeded(new QuotaExceededError())).toBe(true);
  });

  it.each([
    'AiError: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade',
    '4006',
    'You have used up your Daily Free Allocation',
  ])('Workers AI 한도 초과 메시지: %s', (message) => {
    expect(isQuotaExceeded(new Error(message))).toBe(true);
  });

  it('감싼 에러의 cause를 따라간다', () => {
    const inner = new Error('4006: you have used up your daily free allocation of 10,000 neurons');
    const wrapped = new Error('model call failed', { cause: new Error('upstream', { cause: inner }) });
    expect(isQuotaExceeded(wrapped)).toBe(true);
  });

  it('문자열로 던진 경우도 본다', () => {
    expect(isQuotaExceeded('4006: daily free allocation')).toBe(true);
  });

  it.each([
    new Error('스키마 검증 실패'),
    new Error('rate limited: 429'),
    new Error('timeout after 40060ms'),
    undefined,
    null,
    { message: '4006' }, // Error가 아닌 객체는 판별하지 않는다
  ])('한도 초과가 아님: %s', (error) => {
    expect(isQuotaExceeded(error)).toBe(false);
  });
});
