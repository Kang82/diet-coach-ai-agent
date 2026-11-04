// 테스트와 로컬 개발용 저장소. 값을 복사해서 넣고 꺼내므로 바깥에서 고쳐도 저장된 값은 그대로다.
import type { Plan, Profile } from '../core/types.ts';
import { ConsentRequiredError, type Storage } from './storage.ts';

export class MemoryStorage implements Storage {
  private profiles = new Map<string, Profile>();
  private plans: Plan[] = [];

  async getProfile(userId: string): Promise<Profile | null> {
    const profile = this.profiles.get(userId);
    return profile ? structuredClone(profile) : null;
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    if (!profile.consentedAt) throw new ConsentRequiredError();
    const previous = this.profiles.get(profile.userId);
    const saved: Profile = { ...structuredClone(profile), version: (previous?.version ?? 0) + 1 };
    this.profiles.set(profile.userId, saved);
    return structuredClone(saved);
  }

  async deleteUser(userId: string): Promise<void> {
    this.profiles.delete(userId);
    this.plans = this.plans.filter((plan) => plan.userId !== userId);
  }

  async savePlan(plan: Plan): Promise<void> {
    this.plans.push(structuredClone(plan));
  }

  async getLatestPlan(userId: string): Promise<Plan | null> {
    const latest = this.plans.findLast((plan) => plan.userId === userId);
    return latest ? structuredClone(latest) : null;
  }
}
