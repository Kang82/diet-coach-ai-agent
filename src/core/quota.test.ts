// 스펙 11.3. isQuotaExceeded는 임시 구현이다 (열린 질문 6). 실제 에러를 본 뒤 케이스를 고친다.
import { describe, expect, it } from 'vitest';
import { isQuotaExceeded, QuotaExceededError } from './quota.ts';

describe('isQuotaExceeded', () => {
  it('QuotaExceededError', () => {
    expect(isQuotaExceeded(new QuotaExceededError())).toBe(true);
  });

  it.each([
    'AiError: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade',
    'You have used up your Daily Free Allocation',
    '4006: please upgrade to Workers Paid',
    'InferenceUpstreamError: 4006: limit reached',
    '{"errors":[{"code":4006,"message":"limit"}]}',
  ])('Workers AI 한도 초과 메시지: %s', (message) => {
    expect(isQuotaExceeded(new Error(message))).toBe(true);
  });

  it('감싼 에러의 cause를 따라간다', () => {
    const inner = new Error('4006: you have used up your daily free allocation of 10,000 neurons');
    const wrapped = new Error('model call failed', { cause: new Error('upstream', { cause: inner }) });
    expect(isQuotaExceeded(wrapped)).toBe(true);
  });

  it('문자열로 던진 경우도 본다', () => {
    expect(isQuotaExceeded('daily free allocation')).toBe(true);
  });

  it('문자열 message를 가진 일반 객체도 본다 (Flue 이벤트의 errorInfo 등)', () => {
    expect(isQuotaExceeded({ message: 'you have used up your daily free allocation' })).toBe(true);
    expect(isQuotaExceeded({ message: 'x', cause: { message: '4006: limit' } })).toBe(true);
  });

  it('cause가 자기 자신을 가리켜도 멈춘다', () => {
    const error = new Error('순환');
    (error as { cause?: unknown }).cause = error;
    expect(isQuotaExceeded(error)).toBe(false);
  });

  it.each([
    new Error('스키마 검증 실패'),
    new Error('rate limited: 429'),
    new Error('timeout after 40060ms'),
    new Error('cf-ray: 8f1a-4006-bc12'), // 요청 ID에 4006이 섞인 경우
    new Error('context length 4006 tokens exceeds limit'),
    new Error('4006'), // 숫자만으로는 판별하지 않는다
    { message: 4006 },
    undefined,
    null,
  ])('한도 초과가 아님: %s', (error) => {
    expect(isQuotaExceeded(error)).toBe(false);
  });
});
