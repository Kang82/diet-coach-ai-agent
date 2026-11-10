// 스펙 5장 저장소 인터페이스. 구현은 MemoryStorage(테스트·로컬)와 D1Storage. 둘 다 storage-contract.ts를 통과한다.
import type { Plan, Profile } from '../core/types.ts';

export interface Storage {
  getProfile(userId: string): Promise<Profile | null>;
  /** 저장된 버전에 1을 더해 저장하고, 저장된 값을 돌려준다. 동의 시각이 없으면 에러. */
  saveProfile(profile: Profile): Promise<Profile>;
  /** 프로필과 식단표를 모두 지운다. */
  deleteUser(userId: string): Promise<void>;
  /** conversationId: 그 식단표를 만든 대화 (T28). 지난주 체크와 메뉴를 잇는 데 쓴다 */
  savePlan(plan: Plan, conversationId?: string): Promise<void>;
  /** 가장 나중에 저장한 식단표. */
  getLatestPlan(userId: string): Promise<Plan | null>;
  /** 그 사용자의 그 대화에서 가장 나중에 저장한 식단표(칸 수정 뒤 값). 없으면 null (T28) */
  getPlanOfConversation(userId: string, conversationId: string): Promise<Plan | null>;
}

export class ConsentRequiredError extends Error {
  constructor() {
    super('민감정보 저장 동의가 없어 프로필을 저장할 수 없습니다.');
    this.name = 'ConsentRequiredError';
  }
}
