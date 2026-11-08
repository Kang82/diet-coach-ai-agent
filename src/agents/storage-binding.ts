// 에이전트(Durable Object) 안에서 쓰는 D1 저장소 (T6-2). usage-meter.ts처럼 'cloudflare:workers'는 이 파일에서만 import한다.
import { env } from 'cloudflare:workers';
import { D1Storage, type D1Like } from '../storage/d1-storage.ts';
import { D1GuardStore } from '../storage/guard-store.ts';
import type { Storage } from '../storage/storage.ts';

export function agentStorage(): Storage {
  return new D1Storage(env.DB as D1Like);
}

/** 대화 목록 표시(T17)용 한도 보호 저장소 */
export function agentGuardStore(): D1GuardStore {
  return new D1GuardStore(env.DB as D1Like);
}
