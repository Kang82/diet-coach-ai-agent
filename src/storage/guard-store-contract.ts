// 한도 보호 카운터 저장소 계약 테스트 (스펙 11.4). 모든 GuardStore 구현이 통과해야 한다.
import { describe, expect, it } from 'vitest';
import type { GuardStore } from './guard-store.ts';

export function guardStoreContract(
  name: string,
  create: (users: readonly { userId: string; tokenHash: string }[]) => GuardStore | Promise<GuardStore>,
) {
  describe(name, () => {
    it('해시로 사용자를 찾고, 모르는 해시는 null', async () => {
      const store = await create([{ userId: 'u1', tokenHash: 'h1' }]);
      expect(await store.findUserByTokenHash('h1')).toBe('u1');
      expect(await store.findUserByTokenHash('h2')).toBeNull();
    });

    it('메시지 수는 상한까지만 센다', async () => {
      const store = await create([]);
      expect(await store.tryCountMessage('u1', '2026-11-06', 2)).toBe(true);
      expect(await store.tryCountMessage('u1', '2026-11-06', 2)).toBe(true);
      expect(await store.tryCountMessage('u1', '2026-11-06', 2)).toBe(false);
      expect(await store.tryCountMessage('u1', '2026-11-06', 2)).toBe(false);
    });

    it('메시지 수는 사용자와 날짜마다 따로 센다', async () => {
      const store = await create([]);
      expect(await store.tryCountMessage('u1', '2026-11-06', 1)).toBe(true);
      expect(await store.tryCountMessage('u1', '2026-11-06', 1)).toBe(false);
      expect(await store.tryCountMessage('u2', '2026-11-06', 1)).toBe(true);
      expect(await store.tryCountMessage('u1', '2026-11-07', 1)).toBe(true);
    });

    it('Neuron은 기록이 없으면 0, 같은 시간 칸에 쌓인다', async () => {
      const store = await create([]);
      expect(await store.neuronsSince('2026-11-06T00')).toBe(0);
      await store.addNeurons('2026-11-06T12', 12.5);
      await store.addNeurons('2026-11-06T12', 100);
      expect(await store.neuronsSince('2026-11-06T12')).toBeCloseTo(112.5);
    });

    it('fromHour 칸부터 뒤 칸만 더한다 (날짜가 바뀌어도 이어서)', async () => {
      const store = await create([]);
      await store.addNeurons('2026-11-06T09', 1);
      await store.addNeurons('2026-11-06T10', 20);
      await store.addNeurons('2026-11-06T23', 300);
      await store.addNeurons('2026-11-07T00', 4_000);
      expect(await store.neuronsSince('2026-11-06T10')).toBeCloseTo(4_320);
      expect(await store.neuronsSince('2026-11-07T00')).toBeCloseTo(4_000);
      expect(await store.neuronsSince('2026-11-07T01')).toBe(0);
    });

    it('메시지 수와 Neuron은 서로 영향을 주지 않는다', async () => {
      const store = await create([]);
      await store.addNeurons('2026-11-06T12', 50);
      expect(await store.tryCountMessage('u1', '2026-11-06', 1)).toBe(true);
      expect(await store.neuronsSince('2026-11-06T00')).toBeCloseTo(50);
    });
  });
}
