// 사용자 링크 토큰 발급 (스펙 11.4-1, B8).
//   npm run issue-token -- --local                       개발 서버(.wrangler 로컬 D1)용
//   npm run issue-token -- --remote --origin https://…   배포한 Worker용 (B9 이후)
// 토큰(256비트)과 사용자 ID를 만들고, D1 users에는 SHA-256 해시만 넣는다. 링크는 이 화면에 한 번만 출력한다.
// 토큰 원문은 어디에도 저장하지 않으니 링크를 잃으면 새로 발급한다.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : undefined;
if (!target) {
  console.error('--local 또는 --remote 중 하나를 주세요.');
  process.exit(1);
}
const originIndex = args.indexOf('--origin');
const origin = originIndex >= 0 ? args[originIndex + 1] : 'http://localhost:5199';
if (!origin) {
  console.error('--origin 뒤에 주소를 주세요.');
  process.exit(1);
}

const token = randomBytes(32).toString('base64url');
const userId = randomBytes(8).toString('hex');
const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
// 값이 모두 hex와 ISO 시각이라 따옴표가 섞이지 않는다
const sql = `INSERT INTO users (user_id, token_hash, created_at) VALUES ('${userId}', '${tokenHash}', '${new Date().toISOString()}')`;

// Windows에서 npx를 찾으려면 셸이 필요하다. 셸에 넘길 때는 명령을 한 줄로 만든다(인자 배열 + shell은 Node가 경고한다)
const result = spawnSync(`npx wrangler d1 execute diet-coach ${target} --command "${sql}"`, {
  stdio: ['ignore', 'ignore', 'inherit'],
  shell: true,
});
if (result.status !== 0) {
  console.error('D1에 넣지 못했습니다. 마이그레이션을 먼저 적용했는지 확인하세요 (npm run db:migrate:local).');
  process.exit(result.status ?? 1);
}

const link = new URL(origin);
link.searchParams.set('t', token);
console.log(`사용자 ID: ${userId}`);
console.log(`링크: ${link.href}`);
console.log(`토큰(평가 세트 DIET_COACH_TOKEN): ${token}`);
