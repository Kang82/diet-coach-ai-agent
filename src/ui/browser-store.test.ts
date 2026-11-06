// 이 브라우저에 두는 값 지우기 (B5·B6 리뷰 4번)
import { describe, expect, it } from 'vitest';
import { memoryStore } from './__fixtures__/memory-store.ts';
import { clearAll, clearDrafts, CONVERSATION_KEY, draftKey, PROFILE_KEY } from './browser-store.ts';

describe('clearDrafts', () => {
  it('그 대화의 고른 종류만 지운다', () => {
    const store = memoryStore({
      [draftKey('interview', 'c1')]: '{}',
      [draftKey('period', 'c1')]: '[]',
      [draftKey('interview', 'c2')]: '{}',
    });
    clearDrafts('c1', ['interview'], store);
    expect(Object.keys(store.dump()).sort()).toEqual([draftKey('interview', 'c2'), draftKey('period', 'c1')].sort());
  });
});

describe('clearAll', () => {
  it('대화 ID와 다른 앱 키는 남기고 diet-coach:* 를 모두 지운다', () => {
    const store = memoryStore({
      [CONVERSATION_KEY]: 'c1',
      [PROFILE_KEY]: '{}',
      [draftKey('interview', 'c1')]: '{}',
      [draftKey('menuClasses', 'c0')]: '{}',
      'other-app': 'x',
    });
    clearAll(store);
    expect(store.dump()).toEqual({ [CONVERSATION_KEY]: 'c1', 'other-app': 'x' });
  });

  it('저장소가 없어도 에러 없이 끝난다', () => {
    expect(() => clearAll(undefined)).not.toThrow();
  });
});
