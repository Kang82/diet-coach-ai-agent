import { useLocalD1 } from './__fixtures__/local-d1.ts';
import { D1GuardStore, MemoryGuardStore } from './guard-store.ts';
import { guardStoreContract } from './guard-store-contract.ts';

guardStoreContract('MemoryGuardStore', (users) => new MemoryGuardStore(users));

const local = useLocalD1();

guardStoreContract('D1GuardStore', async (users) => {
  await local.reset(['users', 'usage_daily', 'usage_hourly', 'usage_reservations']);
  const db = local.db();
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
