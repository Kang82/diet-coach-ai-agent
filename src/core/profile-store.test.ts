import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { profileForSave, resultFromProfile, userIdFromConversation } from './profile-store.ts';

describe('userIdFromConversation', () => {
  it('첫 "-" 앞이 사용자 ID', () => {
    expect(userIdFromConversation('174746f762f668ec-84f6bb52-4c5f')).toBe('174746f762f668ec');
  });

  it('접두어가 없으면 에러', () => {
    expect(() => userIdFromConversation('abc')).toThrow();
    expect(() => userIdFromConversation('-abc')).toThrow();
  });
});

describe('profileForSave / resultFromProfile', () => {
  it('저장한 프로필을 다시 결과로 바꾸면 처음 결과와 같다', () => {
    const result = resultFromProfile(profileA);
    const saved = profileForSave(result, 'u1', new Date('2026-11-06T00:00:00Z'));
    expect(saved).toMatchObject({ userId: 'u1', consentedAt: profileA.consentedAt, updatedAt: '2026-11-06T00:00:00.000Z' });
    expect(resultFromProfile(saved)).toEqual(result);
  });

  it('결과에는 사용자 ID, 버전, 수정 시각이 없다', () => {
    expect(Object.keys(resultFromProfile(profileA)).sort()).toEqual(
      ['avoid', 'avoidNote', 'consentedAt', 'goalNote', 'goals', 'meals', 'medication'].sort(),
    );
  });
});
