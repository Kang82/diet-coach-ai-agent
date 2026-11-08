// 대화 기록 지우기 (tasks.md T15, 스펙 5장). 대화마다 Durable Object(FlueDietCoachAgent)에 인터뷰 답·식단표가 남는다.
// Flue에는 대화를 지우는 API가 없어, 생성 클래스에 더한 RPC 메서드 wipeConversation(Agent.destroy, agents/diet-coach.ts)을 부른다.
// DO 이름은 나열할 수 없어 한도 보호 미들웨어가 기록한 사용자별 대화 ID(conversations 테이블)로 찾는다.
import type { GuardStore } from '../storage/guard-store.ts';

/** 대화 하나의 DO 저장소를 지운다. 테스트에서는 가짜로 바꿔 끼운다 */
export type WipeOne = (conversationId: string) => Promise<void>;

/**
 * 그 사용자의 기록된 대화를 모두 지운다. 지운 대화만 기록에서 빼고, 실패한 대화는 남겨 다음에 다시 지울 수 있게 한다.
 * Agent.destroy는 저장소를 지운 뒤 isolate를 끝내서(ctx.abort("destroyed")) 부른 쪽이 abort 에러를 받을 수 있다. 이건 지운 것으로 본다
 */
export async function wipeUserConversations(
  store: GuardStore,
  userId: string,
  wipeOne: WipeOne,
): Promise<{ wiped: number; failed: number }> {
  const ids = await store.conversationsOf(userId);
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        await wipeOne(id);
        return { id, ok: true };
      } catch (error) {
        return { id, ok: isDestroyAbort(error) };
      }
    }),
  );
  const wiped = results.filter((r) => r.ok).map((r) => r.id);
  await store.forgetConversations(userId, wiped);
  return { wiped: wiped.length, failed: ids.length - wiped.length };
}

function isDestroyAbort(error: unknown): boolean {
  return error instanceof Error && /destroyed/.test(error.message);
}
