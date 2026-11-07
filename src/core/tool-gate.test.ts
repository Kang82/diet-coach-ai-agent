// B13(T10-2). 한 번의 모델 응답에서 비싼 도구는 한 번만 돈다.
import { describe, expect, it } from 'vitest';
import { createToolGate } from './tool-gate.ts';

describe('createToolGate', () => {
  it('첫 claim만 true', () => {
    const gate = createToolGate();
    expect(gate.claim()).toBe(true);
    expect(gate.claim()).toBe(false);
    expect(gate.claim()).toBe(false);
  });

  it('게이트마다 따로다 (렌더마다 새로 만든다)', () => {
    const a = createToolGate();
    const b = createToolGate();
    expect(a.claim()).toBe(true);
    expect(b.claim()).toBe(true);
  });
});
