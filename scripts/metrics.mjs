// 효과 측정 보기 (tasks.md T26, Task2 R4). 기획서 5장 성공 기준을 숫자로 출력한다.
//   npm run metrics -- --local     개발 서버(.wrangler 로컬 D1)
//   npm run metrics -- --remote    배포본 D1
// conversations의 숫자·날짜(plan_week_start, plan_cells, plan_edits, profile_edits)와 plan_checks 개수만 읽는다.
// 메뉴·건강 정보는 읽지 않고, 사용자 ID는 출력하지 않는다(순번만). 집계는 metrics-core.mjs.
import { spawnSync } from 'node:child_process';
import { formatSummary, summarize } from './metrics-core.mjs';

const args = process.argv.slice(2);
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : undefined;
if (!target) {
  console.error('--local 또는 --remote 중 하나를 주세요.');
  process.exit(1);
}

const sql = `SELECT c.user_id, c.conversation_id, c.plan_week_start, c.plan_cells, c.plan_edits, c.profile_edits,
  (SELECT COUNT(*) FROM plan_checks p WHERE p.conversation_id = c.conversation_id) AS checks
  FROM conversations c ORDER BY c.created_at`.replace(/\s+/g, ' ');

// Windows에서 npx를 찾으려면 셸이 필요하다 (issue-token.mjs와 같음)
const result = spawnSync(`npx wrangler d1 execute diet-coach ${target} --json --command "${sql}"`, {
  stdio: ['ignore', 'pipe', 'inherit'],
  shell: true,
  encoding: 'utf8',
});
if (result.status !== 0) {
  console.error('D1을 읽지 못했습니다. 마이그레이션(0009)을 적용했는지 확인하세요.');
  process.exit(result.status ?? 1);
}

const results = JSON.parse(result.stdout)[0]?.results ?? [];
const rows = results.map((r) => ({
  userId: r.user_id,
  conversationId: r.conversation_id,
  weekStart: r.plan_week_start,
  cells: r.plan_cells,
  edits: r.plan_edits,
  profileEdits: r.profile_edits,
  checks: r.checks,
}));

const today = new Date().toISOString().slice(0, 10);
console.log(`효과 측정 (${target === '--remote' ? '배포본' : '로컬'}, ${today} UTC, 대화 ${rows.length}개, 평가 세트 제외)`);
for (const line of formatSummary(summarize(rows, today))) console.log(line);
