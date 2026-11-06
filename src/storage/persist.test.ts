import { describe, expect, it } from 'vitest';
import { planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { resultFromProfile } from '../core/profile-store.ts';
import { MemoryStorage } from './memory-storage.ts';
import { persistInterview, persistPlan } from './persist.ts';

const now = new Date('2026-11-06T00:00:00Z');
const consented = resultFromProfile(profileA);
const { consentedAt: _c, ...notConsented } = consented;

describe('persistInterview', () => {
  it('동의하면 저장하고, 다시 동의하면 버전이 오른다', async () => {
    const storage = new MemoryStorage();
    await persistInterview(storage, 'u1', consented, now);
    await persistInterview(storage, 'u1', { ...consented, goalNote: '감량만' }, now);
    expect(await storage.getProfile('u1')).toMatchObject({ userId: 'u1', version: 2, goalNote: '감량만' });
  });

  it('동의하지 않으면 그 사용자의 프로필과 식단표를 지우고 다른 사용자는 남긴다', async () => {
    const storage = new MemoryStorage();
    await persistInterview(storage, 'u1', consented, now);
    await storage.savePlan({ ...planA, userId: 'u1' });
    await persistInterview(storage, 'u2', consented, now);
    await persistInterview(storage, 'u1', notConsented, now);
    expect(await storage.getProfile('u1')).toBeNull();
    expect(await storage.getLatestPlan('u1')).toBeNull();
    expect(await storage.getProfile('u2')).not.toBeNull();
  });
});

describe('persistPlan', () => {
  it('동의한 프로필이 있으면 사용자 ID와 프로필 버전을 맞춰 저장한다', async () => {
    const storage = new MemoryStorage();
    await persistInterview(storage, 'u1', consented, now);
    expect(await persistPlan(storage, 'u1', { ...planA, userId: 'demo', profileVersion: 0 })).toBe(true);
    expect(await storage.getLatestPlan('u1')).toMatchObject({ planId: planA.planId, userId: 'u1', profileVersion: 1 });
  });

  it('저장한 프로필이 없으면(동의 안 함) 저장하지 않는다', async () => {
    const storage = new MemoryStorage();
    expect(await persistPlan(storage, 'u1', planA)).toBe(false);
    expect(await storage.getLatestPlan('u1')).toBeNull();
  });
});
