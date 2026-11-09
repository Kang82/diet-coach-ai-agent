// 에이전트(Durable Object) 안에서 Worker 전체 Neuron 카운터에 더하는 meter (스펙 11.4-3).
// 지금 시각의 시간 칸(UTC)에 더한다. 안전선은 최근 24시간 칸을 합산한다 (tasks.md T7-5).
// 'cloudflare:workers'는 이 파일에서만 import한다. 단위 테스트(Node)에서 불러오는 파일에는 넣지 않는다.
import { env } from 'cloudflare:workers';
import { utcHour } from '../core/guard.ts';
import type { D1Like } from '../storage/d1-storage.ts';
import { D1GuardStore } from '../storage/guard-store.ts';
import type { NeuronMeter } from './metered-harness.ts';
import { userIdFromConversation } from '../core/profile-store.ts';

export const usageMeter: NeuronMeter = {
  async add(neurons) {
    // Infinity가 저장되면 24시간 동안 모두 막힌다. 이상한 값은 부르는 쪽(metered-harness)이 시간 추정으로 바꿔 넘긴다
    if (!Number.isFinite(neurons) || neurons <= 0) return;
    await new D1GuardStore(env.DB as D1Like).addNeurons(utcHour(new Date()), neurons);
  },
};

/**
 * 미들웨어가 둔 진행 중 예약(T10-4)을 지운다. key는 사용자 ID(T19-7, 대화 ID "<userId>-…"에서 얻음, server/guard.ts).
 * 비싼 도구가 끝날 때 부른다(plan-tool-support.ts runGuarded). 사용자 ID가 없는 대화는 미들웨어를 거치지 않아 예약도 없다
 */
export function reservationRelease(conversationId: string): () => Promise<void> {
  return async () => {
    let userId: string;
    try {
      userId = userIdFromConversation(conversationId);
    } catch {
      return;
    }
    await new D1GuardStore(env.DB as D1Like).release(userId);
  };
}
