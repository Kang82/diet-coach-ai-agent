// 한도 보호 카운터 저장소 계약 테스트 (스펙 11.4). 모든 GuardStore 구현이 통과해야 한다.
import { describe, expect, it } from 'vitest';
import type { GuardStore, InviteSeed } from './guard-store.ts';

export function guardStoreContract(
  name: string,
  create: (
    users: readonly { userId: string; tokenHash: string }[],
    invites?: readonly InviteSeed[],
  ) => GuardStore | Promise<GuardStore>,
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

    // B13(T10-4), T19-7: 진행 중 예약. 검사와 예약을 한 번에 한다
    it('tryReserve: 최근 합계 + 만료 전 예약 + 이번 양이 상한 안이면 ok, 넘으면 over_limit, 같은 키가 진행 중이면 busy', async () => {
      const store = await create([]);
      const at = (expiresAt: string) => ({ now: '2026-11-06T12:00:00.000Z', fromHour: '2026-11-05T12', limit: 2_000, expiresAt });
      await store.addNeurons('2026-11-06T11', 500);
      await store.addNeurons('2026-11-05T11', 9_999); // 창 밖
      expect(await store.tryReserve('u1', 1_000, at('2026-11-06T12:20:00.000Z'))).toBe('ok');
      expect(await store.tryReserve('u1', 1, at('2026-11-06T12:20:00.000Z'))).toBe('busy');
      // 500 + 1,000 + 501 > 2,000
      expect(await store.tryReserve('u2', 501, at('2026-11-06T12:20:00.000Z'))).toBe('over_limit');
      expect(await store.tryReserve('u2', 500, at('2026-11-06T12:05:00.000Z'))).toBe('ok');
      // u1을 지우면 다시 된다. 없는 키를 지워도 괜찮다
      await store.release('u1');
      await store.release('없는키');
      expect(await store.tryReserve('u1', 1_000, at('2026-11-06T12:20:00.000Z'))).toBe('ok');
    });

    it('tryReserve: 만료된 예약은 합계에서 빠지고, 같은 키도 다시 예약된다', async () => {
      const store = await create([]);
      const opts = (now: string) => ({ now, fromHour: '2026-11-05T12', limit: 1_500, expiresAt: '2026-11-06T13:00:00.000Z' });
      expect(await store.tryReserve('u1', 1_000, { ...opts('2026-11-06T12:00:00.000Z'), expiresAt: '2026-11-06T12:20:00.000Z' })).toBe('ok');
      expect(await store.tryReserve('u2', 1_000, opts('2026-11-06T12:10:00.000Z'))).toBe('over_limit');
      expect(await store.tryReserve('u2', 1_000, opts('2026-11-06T12:20:00.000Z'))).toBe('ok');
      expect(await store.tryReserve('u1', 400, opts('2026-11-06T12:20:00.000Z'))).toBe('ok');
      expect(await store.tryReserve('u3', 101, opts('2026-11-06T12:20:00.000Z'))).toBe('over_limit');
    });

    // T22-4: "모두 지우기"는 진행 중인 비싼 요청이 있으면 막는다
    it('hasActiveReservation: 만료 전 예약이 있을 때만 true, 지우거나 만료되면 false', async () => {
      const store = await create([]);
      const opts = { now: '2026-11-06T12:00:00.000Z', fromHour: '2026-11-05T12', limit: 100_000, expiresAt: '2026-11-06T12:20:00.000Z' };
      expect(await store.hasActiveReservation('h1', '2026-11-06T12:00:00.000Z')).toBe(false);
      expect(await store.tryReserve('h1', 100, opts)).toBe('ok');
      expect(await store.hasActiveReservation('h1', '2026-11-06T12:19:59.000Z')).toBe(true);
      expect(await store.hasActiveReservation('h2', '2026-11-06T12:10:00.000Z')).toBe(false);
      expect(await store.hasActiveReservation('h1', '2026-11-06T12:20:00.000Z')).toBe(false);
      await store.release('h1');
      expect(await store.hasActiveReservation('h1', '2026-11-06T12:10:00.000Z')).toBe(false);
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

    it('대화 나열은 넣은 순서가 아니라 기록 시각 순이다 (T22-3)', async () => {
      const store = await create([]);
      await store.recordConversation('o1', 'o1-late', '2026-11-08T05:00:00.000Z');
      await store.recordConversation('o1', 'o1-early', '2026-11-08T01:00:00.000Z');
      await store.recordConversation('o1', 'o1-mid', '2026-11-08T03:00:00.000Z');
      expect(await store.conversationsOf('o1')).toEqual(['o1-early', 'o1-mid', 'o1-late']);
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

    // 지난 식단표 목록 (T17): 식단표를 만들었거나 고친 대화만, 최근 순. D1 구현은 테스트끼리 같은 DB라 사용자 ID를 따로 쓴다
    it('식단표를 표시한 대화만 최근 순으로 나열하고, 다른 사용자 대화는 빼며 limit을 지킨다', async () => {
      const store = await create([]);
      for (const id of ['l1-a', 'l1-b', 'l1-c', 'l1-d']) await store.recordConversation('l1', id, '2026-11-08T00:00:00.000Z');
      await store.recordConversation('l2', 'l2-a', '2026-11-08T00:00:00.000Z');
      await store.markConversationPlan('l1-a', '2026-11-09', '2026-11-08T01:00:00.000Z');
      await store.markConversationPlan('l1-b', '2026-11-16', '2026-11-08T03:00:00.000Z');
      await store.markConversationPlan('l1-c', '2026-11-09', '2026-11-08T02:00:00.000Z');
      await store.markConversationPlan('l2-a', '2026-11-09', '2026-11-08T04:00:00.000Z');
      expect(await store.planConversations('l1')).toEqual([
        { conversationId: 'l1-b', weekStart: '2026-11-16', planAt: '2026-11-08T03:00:00.000Z' },
        { conversationId: 'l1-c', weekStart: '2026-11-09', planAt: '2026-11-08T02:00:00.000Z' },
        { conversationId: 'l1-a', weekStart: '2026-11-09', planAt: '2026-11-08T01:00:00.000Z' },
      ]);
      expect((await store.planConversations('l1', 2)).map((c) => c.conversationId)).toEqual(['l1-b', 'l1-c']);
    });

    it('다시 표시하면(칸 수정) 시각이 바뀌어 위로 오고, 기록 없는 대화 표시는 무시하며, 지우면 빠진다', async () => {
      const store = await create([]);
      await store.recordConversation('r1', 'r1-a', '2026-11-08T00:00:00.000Z');
      await store.recordConversation('r1', 'r1-b', '2026-11-08T00:00:00.000Z');
      await store.markConversationPlan('r1-a', '2026-11-09', '2026-11-08T01:00:00.000Z');
      await store.markConversationPlan('r1-b', '2026-11-09', '2026-11-08T02:00:00.000Z');
      await store.markConversationPlan('r1-a', '2026-11-09', '2026-11-08T05:00:00.000Z');
      await store.markConversationPlan('r1-zzz', '2026-11-09', '2026-11-08T06:00:00.000Z');
      expect((await store.planConversations('r1')).map((c) => c.conversationId)).toEqual(['r1-a', 'r1-b']);
      await store.forgetConversations('r1', ['r1-a']);
      expect((await store.planConversations('r1')).map((c) => c.conversationId)).toEqual(['r1-b']);
    });

    // T24: 초대 코드로 사용자 만들기
    const newUser = (n: number) => ({ userId: `n${n}`, tokenHash: `nh${n}`, at: '2026-11-10T00:00:00.000Z' });

    it('초대 코드는 상한까지만 쓰이고, 쓰인 만큼 사용자가 생긴다', async () => {
      const store = await create([], [{ codeHash: 'c1', maxUses: 2 }]);
      expect(await store.registerWithInvite('c1', newUser(1))).toBe(true);
      expect(await store.registerWithInvite('c1', newUser(2))).toBe(true);
      expect(await store.registerWithInvite('c1', newUser(3))).toBe(false);
      expect(await store.findUserByTokenHash('nh1')).toBe('n1');
      expect(await store.findUserByTokenHash('nh2')).toBe('n2');
      expect(await store.findUserByTokenHash('nh3')).toBeNull();
    });

    it('모르는 코드나 이미 다 쓴 코드는 false이고 사용자를 만들지 않는다', async () => {
      const store = await create([], [{ codeHash: 'c1', maxUses: 3, used: 3 }]);
      expect(await store.registerWithInvite('c2', newUser(1))).toBe(false);
      expect(await store.registerWithInvite('c1', newUser(2))).toBe(false);
      expect(await store.findUserByTokenHash('nh1')).toBeNull();
      expect(await store.findUserByTokenHash('nh2')).toBeNull();
    });

    it('마지막 한 자리에 동시에 와도 하나만 쓴다', async () => {
      const store = await create([], [{ codeHash: 'c1', maxUses: 1 }]);
      const results = await Promise.all([1, 2, 3].map((n) => store.registerWithInvite('c1', newUser(n))));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('발급 시도 수는 key·날짜마다 상한까지 센다', async () => {
      const store = await create([]);
      expect(await store.tryCountKey('register:a', '2026-11-10', 2)).toBe(true);
      expect(await store.tryCountKey('register:a', '2026-11-10', 2)).toBe(true);
      expect(await store.tryCountKey('register:a', '2026-11-10', 2)).toBe(false);
      expect(await store.tryCountKey('register:b', '2026-11-10', 2)).toBe(true);
      expect(await store.tryCountKey('register:a', '2026-11-11', 2)).toBe(true);
    });

    // T26: 측정 숫자
    it('만들기 표시는 칸 수와 수정 0, 칸 수정 표시는 +1, 다시 만들면 0으로', async () => {
      const store = await create([]);
      await store.recordConversation('m1', 'm1-a', '2026-11-10T00:00:00.000Z');
      expect(await store.conversationMetrics('m1-a')).toEqual({ planCells: null, planEdits: null, profileEdits: null });
      await store.markConversationPlan('m1-a', '2026-11-16', '2026-11-10T01:00:00.000Z', { cells: 14, edited: false });
      expect(await store.conversationMetrics('m1-a')).toEqual({ planCells: 14, planEdits: 0, profileEdits: null });
      await store.markConversationPlan('m1-a', '2026-11-16', '2026-11-10T02:00:00.000Z', { cells: 14, edited: true });
      await store.markConversationPlan('m1-a', '2026-11-16', '2026-11-10T03:00:00.000Z', { cells: 14, edited: true });
      expect(await store.conversationMetrics('m1-a')).toEqual({ planCells: 14, planEdits: 2, profileEdits: null });
      await store.markConversationPlan('m1-a', '2026-11-16', '2026-11-10T04:00:00.000Z', { cells: 12, edited: false });
      expect(await store.conversationMetrics('m1-a')).toEqual({ planCells: 12, planEdits: 0, profileEdits: null });
      // 숫자 없이 표시해도(이전 호출 모양) 숫자는 그대로
      await store.markConversationPlan('m1-a', '2026-11-16', '2026-11-10T05:00:00.000Z');
      expect(await store.conversationMetrics('m1-a')).toEqual({ planCells: 12, planEdits: 0, profileEdits: null });
    });

    it('프로필 고친 항목 수는 덮어쓰고, 기록 없는 대화는 무시한다', async () => {
      const store = await create([]);
      await store.recordConversation('m1', 'm1-a', '2026-11-10T00:00:00.000Z');
      await store.setProfileEdits('m1-a', 2);
      await store.setProfileEdits('m1-a', 1);
      expect((await store.conversationMetrics('m1-a'))?.profileEdits).toBe(1);
      await store.setProfileEdits('m1-zzz', 3);
      await store.markConversationPlan('m1-zzz', '2026-11-16', '2026-11-10T01:00:00.000Z', { cells: 14, edited: false });
      expect(await store.conversationMetrics('m1-zzz')).toBeNull();
    });

    // T25: 먹었어요 체크
    const AT = '2026-11-10T00:00:00.000Z';
    async function withPlan(store: GuardStore, userId: string, conversationId: string) {
      await store.recordConversation(userId, conversationId, AT);
      await store.markConversationPlan(conversationId, '2026-11-09', AT);
    }

    it('식단표 대화에만 체크가 들어간다 (식단표 없음·남의 대화·기록 없는 대화는 false)', async () => {
      const store = await create([]);
      await withPlan(store, 'k1', 'k1-a');
      await store.recordConversation('k1', 'k1-noplan', AT);
      const slot = { day: 'mon', meal: 'lunch' } as const;
      expect(await store.setCheck('k1', 'k1-a', slot, true, AT)).toBe(true);
      expect(await store.setCheck('k1', 'k1-noplan', slot, true, AT)).toBe(false);
      expect(await store.setCheck('k2', 'k1-a', slot, true, AT)).toBe(false);
      expect(await store.setCheck('k1', 'k1-zzz', slot, true, AT)).toBe(false);
      expect(await store.checksOf('k1', 'k1-noplan')).toEqual([]);
      expect(await store.checksOf('k2', 'k1-a')).toEqual([]);
      expect(await store.checksOf('k1', 'k1-a')).toEqual([slot]);
    });

    it('체크·해제·다시 체크, 같은 칸 두 번 체크해도 하나, 목록은 칸 순서', async () => {
      const store = await create([]);
      await withPlan(store, 'k1', 'k1-a');
      expect(await store.setCheck('k1', 'k1-a', { day: 'tue', meal: 'dinner' }, true, AT)).toBe(true);
      expect(await store.setCheck('k1', 'k1-a', { day: 'mon', meal: 'dinner' }, true, AT)).toBe(true);
      expect(await store.setCheck('k1', 'k1-a', { day: 'mon', meal: 'breakfast' }, true, AT)).toBe(true);
      expect(await store.setCheck('k1', 'k1-a', { day: 'mon', meal: 'breakfast' }, true, AT)).toBe(true);
      expect(await store.checksOf('k1', 'k1-a')).toEqual([
        { day: 'mon', meal: 'breakfast' },
        { day: 'mon', meal: 'dinner' },
        { day: 'tue', meal: 'dinner' },
      ]);
      expect(await store.setCheck('k1', 'k1-a', { day: 'mon', meal: 'dinner' }, false, AT)).toBe(true);
      expect(await store.setCheck('k1', 'k1-a', { day: 'mon', meal: 'dinner' }, false, AT)).toBe(true);
      expect(await store.checksOf('k1', 'k1-a')).toEqual([
        { day: 'mon', meal: 'breakfast' },
        { day: 'tue', meal: 'dinner' },
      ]);
      expect(await store.setCheck('k1', 'k1-a', { day: 'mon', meal: 'dinner' }, true, AT)).toBe(true);
      expect(await store.checksOf('k1', 'k1-a')).toHaveLength(3);
    });

    it('대화마다 따로, 모두 지우기는 그 사용자 것만', async () => {
      const store = await create([]);
      await withPlan(store, 'k1', 'k1-a');
      await withPlan(store, 'k1', 'k1-b');
      await withPlan(store, 'k2', 'k2-a');
      const slot = { day: 'fri', meal: 'lunch' } as const;
      await store.setCheck('k1', 'k1-a', slot, true, AT);
      await store.setCheck('k1', 'k1-b', { day: 'sat', meal: 'lunch' }, true, AT);
      await store.setCheck('k2', 'k2-a', slot, true, AT);
      expect(await store.checksOf('k1', 'k1-a')).toEqual([slot]);
      expect(await store.checksOf('k1', 'k1-b')).toEqual([{ day: 'sat', meal: 'lunch' }]);
      await store.deleteChecksOf('k1');
      expect(await store.checksOf('k1', 'k1-a')).toEqual([]);
      expect(await store.checksOf('k1', 'k1-b')).toEqual([]);
      expect(await store.checksOf('k2', 'k2-a')).toEqual([slot]);
    });
  });
}
