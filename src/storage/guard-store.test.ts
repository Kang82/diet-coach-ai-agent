import { useLocalD1 } from './__fixtures__/local-d1.ts';
import { D1GuardStore, MemoryGuardStore } from './guard-store.ts';
import { guardStoreContract } from './guard-store-contract.ts';

guardStoreContract('MemoryGuardStore', (users, invites) => new MemoryGuardStore(users, invites));

const local = useLocalD1();

guardStoreContract('D1GuardStore', async (users, invites = []) => {
  await local.reset(['users', 'usage_daily', 'usage_hourly', 'usage_reservations', 'invites']);
  const db = local.db();
  if (invites.length > 0) {
    await db.batch(
      invites.map((i) =>
        db
          .prepare('INSERT INTO invites (code_hash, max_uses, used, created_at) VALUES (?, ?, ?, ?)')
          .bind(i.codeHash, i.maxUses, i.used ?? 0, '2026-11-10T00:00:00Z'),
      ),
    );
  }
  if (users.length > 0) {
    await db.batch(
      users.map((u) =>
        db
          .prepare('INSERT INTO users (user_id, token_hash, created_at) VALUES (?, ?, ?)')
          .bind(u.userId, u.tokenHash, '2026-11-06T00:00:00Z'),
      ),
    );
  }
  return new D1GuardStore(db);
});
