// D1Storage 계약 테스트. @cloudflare/vitest-pool-workers는 vitest 4만 지원해서(이 프로젝트는 5),
// wrangler의 getPlatformProxy로 Node 안에서 로컬 D1을 띄운다. persist: false라 디스크에 남지 않는다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { D1Storage, type D1Like } from './d1-storage.ts';
import { storageContract } from './storage-contract.ts';

const root = join(import.meta.dirname, '..', '..');
let db: D1Like;
let dispose: () => Promise<void>;

/** migrations/의 SQL 파일을 이름 순서대로 적용한다 (wrangler d1 migrations apply와 같은 순서). */
async function applyMigrations(target: D1Like) {
  const dir = join(root, 'migrations');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8').replace(/--.*$/gm, '');
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await target.batch(statements.map((statement) => target.prepare(statement)));
  }
}

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Like }>({
    configPath: join(root, 'wrangler.storage-test.jsonc'),
    persist: false,
  });
  db = proxy.env.DB;
  dispose = proxy.dispose;
  await applyMigrations(db);
}, 30_000);

afterAll(async () => {
  await dispose?.();
});

storageContract('D1Storage', async () => {
  await db.batch([db.prepare('DELETE FROM profiles'), db.prepare('DELETE FROM plans')]);
  return new D1Storage(db);
});
