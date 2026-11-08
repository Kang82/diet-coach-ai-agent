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

    // B13(T10-3): 종류별 하루 횟수
    it('종류별 횟수는 종류·사용자·날짜마다 따로, 메시지 수와도 따로 센다', async () => {
      const store = await create([]);
      expect(await store.tryCountKind('u1', 'plan', '2026-11-06', 1)).toBe(true);
      expect(await store.tryCountKind('u1', 'plan', '2026-11-06', 1)).toBe(false);
      expect(await store.tryCountKind('u1', 'edit', '2026-11-06', 1)).toBe(true);
      expect(await store.tryCountKind('u2', 'plan', '2026-11-06', 1)).toBe(true);
      expect(await store.tryCountKind('u1', 'plan', '2026-11-07', 1)).toBe(true);
      expect(await store.tryCountMessage('u1', '2026-11-06', 1)).toBe(true);
    });

    // B13(T10-4): 진행 중 예약
    it('예약은 만료 전까지만 더하고, 같은 키면 덮어쓰며, 지우면 빠진다', async () => {
      const store = await create([]);
      expect(await store.reservedNeurons('2026-11-06T12:00:00.000Z')).toBe(0);
      await store.reserve('c1', 1_200, '2026-11-06T12:20:00.000Z');
      await store.reserve('c2', 600, '2026-11-06T12:05:00.000Z');
      expect(await store.reservedNeurons('2026-11-06T12:00:00.000Z')).toBeCloseTo(1_800);
      expect(await store.reservedNeurons('2026-11-06T12:05:00.000Z')).toBeCloseTo(1_200);
      expect(await store.reservedNeurons('2026-11-06T12:00:00.000Z', 'c1')).toBeCloseTo(600);
      await store.reserve('c1', 360, '2026-11-06T12:30:00.000Z');
      expect(await store.reservedNeurons('2026-11-06T12:00:00.000Z')).toBeCloseTo(960);
      await store.release('c1');
      await store.release('없는키');
      expect(await store.reservedNeurons('2026-11-06T12:00:00.000Z')).toBeCloseTo(600);
    });

    it('메시지 수와 Neuron은 서로 영향을 주지 않는다', async () => {
      const store = await create([]);
      await store.addNeurons('2026-11-06T12', 50);
      expect(await store.tryCountMessage('u1', '2026-11-06', 1)).toBe(true);
      expect(await store.neuronsSince('2026-11-06T00')).toBeCloseTo(50);
    });

    // 대화 기록 지우기 (tasks.md T15): DO 이름은 나열할 수 없어 사용자별 대화 ID를 따로 기록한다
    it('대화는 중복 없이 기록하고, 사용자별로 처음 기록한 순서대로 나열한다', async () => {
      const store = await create([]);
      await store.recordConversation('u1', 'u1-a', '2026-11-08T01:00:00.000Z');
      await store.recordConversation('u1', 'u1-b', '2026-11-08T02:00:00.000Z');
      await store.recordConversation('u1', 'u1-a', '2026-11-08T03:00:00.000Z');
      await store.recordConversation('u2', 'u2-a', '2026-11-08T01:30:00.000Z');
      expect(await store.conversationsOf('u1')).toEqual(['u1-a', 'u1-b']);
      expect(await store.conversationsOf('u2')).toEqual(['u2-a']);
      expect(await store.conversationsOf('u3')).toEqual([]);
    });

    it('forgetConversations는 그 사용자의 준 ID만 뺀다', async () => {
      const store = await create([]);
      await store.recordConversation('u1', 'u1-a', '2026-11-08T01:00:00.000Z');
      await store.recordConversation('u1', 'u1-b', '2026-11-08T02:00:00.000Z');
      await store.recordConversation('u2', 'u2-a', '2026-11-08T01:00:00.000Z');
      await store.forgetConversations('u1', ['u1-a', 'u2-a']);
      await store.forgetConversations('u1', []);
      expect(await store.conversationsOf('u1')).toEqual(['u1-b']);
      expect(await store.conversationsOf('u2')).toEqual(['u2-a']);
    });
  });
}
