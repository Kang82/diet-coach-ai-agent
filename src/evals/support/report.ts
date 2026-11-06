// 평가 결과를 사람이 보기 쉽게 남긴다. 콘솔 요약과 evals-results/*.json (git에 넣지 않음).
// 메뉴 분류와 이유 문장의 자연스러움은 사람이 확인하므로(스펙 8.5) 식단표 전체를 남긴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import type { ConversationResult } from './agent-http.ts';

export interface RunRecord {
  persona: string;
  run: number;
  result: 'pass' | 'fail' | 'skip';
  note?: string;
  conversationId: string;
  seconds: number;
  output?: unknown;
  violations?: unknown;
}

export function recordRun(
  records: RunRecord[],
  r: Omit<RunRecord, 'conversationId' | 'seconds'> & { res: ConversationResult },
): void {
  const { res, ...rest } = r;
  records.push({ ...rest, conversationId: res.conversationId, seconds: res.seconds });
}

export function writeReport(records: RunRecord[]): void {
  if (records.length === 0) return;
  for (const r of records) {
    const stats = (r.output as { stats?: { neurons?: number; regenerations?: number } } | undefined)?.stats;
    console.log(
      `[eval] ${r.persona} ${r.run}회차: ${r.result}${r.note ? ` (${r.note})` : ''}` +
        ` / ${r.seconds}초 / 다시 추천 ${stats?.regenerations ?? '-'}회 / 약 ${stats?.neurons ?? '-'} Neuron` +
        ` (바깥 턴 제외) / 대화 ${r.conversationId}`,
    );
  }
  mkdirSync('evals-results', { recursive: true });
  const file = `evals-results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(records, null, 2));
  console.log(`[eval] 결과 파일: ${file}`);
}
