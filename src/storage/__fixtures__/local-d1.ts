// 테스트용 로컬 D1. @cloudflare/vitest-pool-workers는 vitest 4만 지원해서(이 프로젝트는 5),
// wrangler의 getPlatformProxy로 Node 안에서 띄운다. persist: false라 디스크에 남지 않는다.
// 설정은 D1만 있는 wrangler.storage-test.jsonc라 원격 호출이 없다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import type { D1Like } from '../d1-storage.ts';

const root = join(import.meta.dirname, '..', '..', '..');

/** migrations/의 SQL 파일을 이름 순서대로 적용한다 (wrangler d1 migrations apply와 같은 순서). */
async function applyMigrations(db: D1Like) {
  const dir = join(root, 'migrations');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    const statements = readFileSync(join(dir, file), 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
}

/**
 * 테스트 파일 하나에서 로컬 D1을 한 번 띄우고 마이그레이션을 적용한다.
 * 돌려준 함수는 테스트 안에서 부르면 D1을 준다. reset으로 테이블을 비운다.
 */
export function useLocalD1(): { db: () => D1Like; reset: (tables: readonly string[]) => Promise<void> } {
  let db: D1Like | undefined;
  let dispose: (() => Promise<void>) | undefined;

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

  const get = () => {
    if (!db) throw new Error('로컬 D1이 아직 준비되지 않았습니다.');
    return db;
  };
  return {
    db: get,
    reset: async (tables) => {
      const d = get();
      await d.batch(tables.map((table) => d.prepare(`DELETE FROM ${table}`)));
    },
  };
}
