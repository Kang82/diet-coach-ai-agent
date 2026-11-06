// 평가 세트용: 개발 서버의 에이전트 대화 주소로 메시지를 보내고, 끝날 때까지 기다려 대화를 읽는다.
// Workers AI 바인딩은 Cloudflare 환경에서만 있어서, 평가는 in-process(start())가 아니라 HTTP로 한다.
// 스트리밍 프로토콜(node_modules/@flue/runtime/docs/reference/streaming-protocol.md)의 스냅샷만 쓴다.

export const AGENT_URL = process.env.DIET_COACH_URL ?? 'http://localhost:5199/agents/diet-coach';

export interface SnapshotPart {
  type: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}

export interface Snapshot {
  messages: { role: string; submissionId?: string; parts: SnapshotPart[] }[];
  settlements: { submissionId: string; outcome: 'completed' | 'failed' | 'aborted'; error?: unknown }[];
}

export interface ConversationResult {
  conversationId: string;
  outcome: 'completed' | 'failed' | 'aborted';
  error?: unknown;
  snapshot: Snapshot;
  seconds: number;
}

/** 개발 서버가 떠 있는지 확인한다. 꺼져 있으면 평가 전체를 멈추도록 에러를 던진다. */
export async function assertServerUp(): Promise<void> {
  const ping = new URL('/api/ping', AGENT_URL);
  try {
    const res = await fetch(ping, { signal: AbortSignal.timeout(5_000) });
    if ((await res.text()) === 'pong') return;
  } catch {
    // 아래에서 안내
  }
  throw new Error(`개발 서버가 응답하지 않습니다 (${ping}). 다른 터미널에서 npm run dev -- --port 5199 를 먼저 띄우세요.`);
}

/** 새 대화에 사용자 메시지를 보내고, 그 제출이 끝날 때까지 기다린다. */
export async function sendAndWait(
  body: string,
  options: { conversationId?: string; timeoutMs?: number; pollMs?: number } = {},
): Promise<ConversationResult> {
  const conversationId = options.conversationId ?? `eval-${crypto.randomUUID()}`;
  const url = `${AGENT_URL}/${conversationId}`;
  const startedAt = Date.now();

  const admitted = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ kind: 'user', body }),
  });
  if (admitted.status !== 202) throw new Error(`메시지 전송 실패: ${admitted.status} ${await admitted.text()}`);
  const { submissionId } = (await admitted.json()) as { submissionId: string };

  const deadline = startedAt + (options.timeoutMs ?? 9 * 60_000);
  for (;;) {
    const snapshot = (await (await fetch(url)).json()) as Snapshot;
    const settled = snapshot.settlements.find((s) => s.submissionId === submissionId);
    if (settled) {
      return {
        conversationId,
        outcome: settled.outcome,
        error: settled.error,
        snapshot,
        seconds: Math.round((Date.now() - startedAt) / 1000),
      };
    }
    if (Date.now() > deadline) throw new Error(`대화가 제한 시간 안에 끝나지 않았습니다: ${conversationId}`);
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 10_000));
  }
}

/** 대화에서 이름이 같은 도구 호출 부분을 순서대로 */
export function toolParts(snapshot: Snapshot, toolName: string): SnapshotPart[] {
  return snapshot.messages.flatMap((m) => m.parts).filter((p) => p.toolName === toolName);
}

/** 도구 출력은 객체나 JSON 문자열로 온다. */
export function parseToolOutput<T>(part: SnapshotPart | undefined): T | undefined {
  if (!part || part.output === undefined) return undefined;
  return (typeof part.output === 'string' ? JSON.parse(part.output) : part.output) as T;
}
