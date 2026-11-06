// 에이전트(Durable Object) 안에서 쓰는 D1 저장소 (T6-2). usage-meter.ts처럼 'cloudflare:workers'는 이 파일에서만 import한다.
import { env } from 'cloudflare:workers';
import { D1Storage, type D1Like } from '../storage/d1-storage.ts';
import type { Storage } from '../storage/storage.ts';

export function agentStorage(): Storage {
  return new D1Storage(env.DB as D1Like);
}
