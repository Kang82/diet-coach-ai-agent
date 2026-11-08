// 대화 기록 지우기 (tasks.md T15). Flue가 만드는 대화 Durable Object 클래스에 RPC 메서드 wipeConversation을 더한다.
// Flue에는 대화를 지우는 API가 없다. 생성 클래스는 Agents SDK Agent를 상속하고, Agent.destroy()가 테이블·알람·저장소(deleteAll)를
// 지운 뒤 isolate를 끝낸다. fetch·onRequest·alarm은 Flue 소유라 덮어쓰지 않는다 (cloudflare-target.md "Extending Agents").
// 부르는 쪽은 server/conversation-wipe.ts. 이 export는 agents/diet-coach.ts의 `cloudflare`로 나간다
import { extend, type CloudflareAgentLike, type ExtensionClass } from '@flue/runtime/cloudflare';

export interface Wipeable {
  wipeConversation(): Promise<void>;
}

type AgentWithDestroy = CloudflareAgentLike & { destroy(): Promise<void> };

export const wipeExtension = extend({
  // Base의 인스턴스 타입(DurableObject 부분)이 이 프로젝트 타입 설정에서 풀리지 않아 Agent 모양으로 좁혀 쓴다
  base: (Base) =>
    class extends (Base as unknown as ExtensionClass<AgentWithDestroy>) implements Wipeable {
      /** 이 대화의 저장소를 모두 지운다. 끝나면 isolate가 끝나 부른 쪽이 "destroyed" abort 에러를 받을 수 있다 */
      async wipeConversation(): Promise<void> {
        await this.destroy();
      }
    },
});
