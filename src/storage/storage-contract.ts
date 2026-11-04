// 스펙 5장, 8.4 저장소 계약 테스트. 모든 Storage 구현이 통과해야 한다.
import { describe, expect, it } from 'vitest';
import { planA, profileA } from '../core/__fixtures__/persona-a.ts';
import { ConsentRequiredError, type Storage } from './storage.ts';

export function storageContract(name: string, create: () => Storage) {
  describe(name, () => {
    it('저장된 프로필이 없으면 null', async () => {
      const storage = create();
      expect(await storage.getProfile('nobody')).toBeNull();
      expect(await storage.getLatestPlan('nobody')).toBeNull();
    });

    it('처음 저장하면 버전 1, 다시 저장하면 2 (넘긴 version은 무시)', async () => {
      const storage = create();
      const first = await storage.saveProfile({ ...profileA, version: 99 });
      expect(first.version).toBe(1);
      const second = await storage.saveProfile({ ...profileA, goalNote: '감량만' });
      expect(second.version).toBe(2);
      expect(await storage.getProfile(profileA.userId)).toEqual(second);
    });

    it('동의 시각이 없으면 저장하지 않는다', async () => {
      const storage = create();
      await expect(storage.saveProfile({ ...profileA, consentedAt: '' })).rejects.toBeInstanceOf(
        ConsentRequiredError,
      );
      expect(await storage.getProfile(profileA.userId)).toBeNull();
    });

    it('돌려준 값을 고쳐도 저장된 값은 바뀌지 않는다', async () => {
      const storage = create();
      const saved = await storage.saveProfile(structuredClone(profileA));
      saved.avoid.push('egg');
      const loaded = await storage.getProfile(profileA.userId);
      expect(loaded?.avoid).toEqual(['dairy']);
      loaded!.avoid.push('soy');
      expect((await storage.getProfile(profileA.userId))?.avoid).toEqual(['dairy']);
    });

    it('가장 나중에 저장한 식단표를 돌려준다', async () => {
      const storage = create();
      await storage.savePlan(planA);
      await storage.savePlan({ ...planA, planId: 'plan-a-2', weekStart: '2026-11-16' });
      await storage.savePlan({ ...planA, planId: 'other', userId: 'user-b' });
      expect((await storage.getLatestPlan(planA.userId))?.planId).toBe('plan-a-2');
    });

    it('deleteUser는 프로필과 식단표를 모두 지우고 다른 사용자는 남긴다', async () => {
      const storage = create();
      await storage.saveProfile(profileA);
      await storage.savePlan(planA);
      await storage.savePlan({ ...planA, planId: 'other', userId: 'user-b' });
      await storage.deleteUser(profileA.userId);
      expect(await storage.getProfile(profileA.userId)).toBeNull();
      expect(await storage.getLatestPlan(profileA.userId)).toBeNull();
      expect((await storage.getLatestPlan('user-b'))?.planId).toBe('other');
    });
  });
}
