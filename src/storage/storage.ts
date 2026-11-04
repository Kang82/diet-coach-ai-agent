// 스펙 5장 저장소 인터페이스. D1 구현은 나중에 이 인터페이스 뒤에 붙인다.
import type { Plan, Profile } from '../core/types.ts';

export interface Storage {
  getProfile(userId: string): Promise<Profile | null>;
  /** 저장된 버전에 1을 더해 저장하고, 저장된 값을 돌려준다. 동의 시각이 없으면 에러. */
  saveProfile(profile: Profile): Promise<Profile>;
  /** 프로필과 식단표를 모두 지운다. */
  deleteUser(userId: string): Promise<void>;
  savePlan(plan: Plan): Promise<void>;
  /** 가장 나중에 저장한 식단표. */
  getLatestPlan(userId: string): Promise<Plan | null>;
}

export class ConsentRequiredError extends Error {
  constructor() {
    super('민감정보 저장 동의가 없어 프로필을 저장할 수 없습니다.');
    this.name = 'ConsentRequiredError';
  }
}
