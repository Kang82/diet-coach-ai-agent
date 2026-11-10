// 공용 초대 코드 만들기 (tasks.md T24). 이 코드를 가진 사람은 처음 들어올 때 직접 개인 토큰을 받는다(POST /api/register).
//   npm run issue-invite -- --local --max 30                       개발 서버(.wrangler 로컬 D1)용
//   npm run issue-invite -- --remote --max 30 --origin https://…   배포한 Worker용
// 코드(Crockford base32 12자)를 만들고, D1 invites에는 SHA-256 해시와 최대 사용 수만 넣는다. 코드는 이 화면에 한 번만 출력한다.
// 폐기: npx wrangler d1 execute diet-coach --remote --command "UPDATE invites SET max_uses = used WHERE code_hash = '<해시>'"
import { spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';

// src/core/registration.ts의 INVITE_ALPHABET·INVITE_CODE_LENGTH와 같아야 한다
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 12;

const args = process.argv.slice(2);
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : undefined;
if (!target) {
  console.error('--local 또는 --remote 중 하나를 주세요.');
  process.exit(1);
}
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const maxUses = Number(valueOf('--max') ?? '30');
if (!Number.isInteger(maxUses) || maxUses < 1) {
  console.error('--max 뒤에 1 이상의 정수를 주세요.');
  process.exit(1);
}
const origin = valueOf('--origin') ?? 'http://localhost:5199';

const code = Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
// 값이 모두 hex·정수·ISO 시각이라 따옴표가 섞이지 않는다
const sql = `INSERT INTO invites (code_hash, max_uses, used, created_at) VALUES ('${codeHash}', ${maxUses}, 0, '${new Date().toISOString()}')`;

// Windows에서 npx를 찾으려면 셸이 필요하다 (issue-token.mjs와 같음)
const result = spawnSync(`npx wrangler d1 execute diet-coach ${target} --command "${sql}"`, {
  stdio: ['ignore', 'ignore', 'inherit'],
  shell: true,
});
if (result.status !== 0) {
  console.error('D1에 넣지 못했습니다. 마이그레이션을 먼저 적용했는지 확인하세요 (npm run db:migrate:local).');
  process.exit(result.status ?? 1);
}

const shown = code.match(/.{4}/g).join('-');
const link = new URL(origin);
link.searchParams.set('invite', shown);
console.log(`초대 코드: ${shown} (최대 ${maxUses}명)`);
console.log(`링크: ${link.href}`);
console.log(`코드 해시(폐기할 때): ${codeHash}`);
