// T26: 효과 측정 집계 (scripts/metrics-core.mjs)
import { describe, expect, it } from 'vitest';
import { formatSummary, summarize } from './metrics-core.mjs';

type Row = Parameters<typeof summarize>[0][number];

let n = 0;
function row(over: Partial<Row>): Row {
  n += 1;
  return { userId: 'u1', conversationId: `u1-${n}`, weekStart: null, cells: null, edits: null, profileEdits: null, checks: 0, ...over };
}

const TODAY = '2026-11-24';

describe('summarize', () => {
  it('행이 없으면 모두 데이터 없음', () => {
    const s = summarize([], TODAY);
    expect(s.profiles).toEqual({ total: 0, ok: 0, rate: null });
    expect(s.weeks).toEqual({ total: 0, ok: 0, rate: null, users: [] });
    expect(s.checks).toEqual({ ended: 0, ok: 0, rate: null, average: null });
    expect(formatSummary(s)).toEqual([
      '기준 1. 프로필에서 고친 항목 1개 이하 (목표 80% 이상): 데이터 없음 (0/0)',
      '기준 2. 고친 칸 3개 이하인 주: 데이터 없음 (0/0)',
      '기준 3. 체크율 70% 이상인 주: 끝난 주 없음',
    ]);
  });

  it('기준 1: 고친 항목 1개까지 통과, 2개부터 아님, 값 없는 대화는 빼고', () => {
    const s = summarize([row({ profileEdits: 0 }), row({ profileEdits: 1 }), row({ profileEdits: 2 }), row({})], TODAY);
    expect(s.profiles).toEqual({ total: 3, ok: 2, rate: 2 / 3 });
  });

  it('기준 2: 고친 칸 3개까지 통과, 칸 수 없는 식단표(0009 전)는 빼고', () => {
    const plan = { weekStart: '2026-11-09', cells: 14 };
    const s = summarize([row({ ...plan, edits: 3 }), row({ ...plan, edits: 4 }), row({ ...plan, edits: 0 }), row({ weekStart: '2026-11-09' })], TODAY);
    expect(s.weeks.total).toBe(3);
    expect(s.weeks.ok).toBe(2);
  });

  it('기준 2 사용자별: 4주 이상이면 3/4 이상인지, 4주 미만이면 판정 없음, 순번만', () => {
    const plan = { weekStart: '2026-11-02', cells: 14 };
    const rows = [
      ...[0, 0, 0, 5].map((edits) => row({ ...plan, userId: 'a', edits })),
      ...[5, 5, 0, 0].map((edits) => row({ ...plan, userId: 'b', edits })),
      row({ ...plan, userId: 'c', edits: 0 }),
    ];
    const s = summarize(rows, TODAY);
    expect(s.weeks.users).toEqual([
      { index: 1, weeks: 4, ok: 3, meets: true },
      { index: 2, weeks: 4, ok: 2, meets: false },
      { index: 3, weeks: 1, ok: 1, meets: null },
    ]);
    const lines = formatSummary(s).join('\n');
    expect(lines).toContain('사용자 1: 3/4주 (충족)');
    expect(lines).toContain('사용자 2: 2/4주 (미충족)');
    expect(lines).toContain('사용자 3: 1/1주 (4주 미만)');
    expect(lines).not.toMatch(/\b[abc]\b/);
  });

  it('기준 3: 끝난 주만, 70% 경계, 평균', () => {
    const rows = [
      // 11/9 주는 11/16에 끝남 → 끝난 주
      row({ weekStart: '2026-11-09', cells: 10, checks: 7 }),
      row({ weekStart: '2026-11-09', cells: 10, checks: 6 }),
      // 11/17 주는 11/24에 끝남(오늘) → 끝난 주, 체크가 칸보다 많아도 100%
      row({ weekStart: '2026-11-17', cells: 10, checks: 12 }),
      // 11/23 주는 아직 → 빼고
      row({ weekStart: '2026-11-23', cells: 10, checks: 10 }),
    ];
    const s = summarize(rows, TODAY);
    expect(s.checks.ended).toBe(3);
    expect(s.checks.ok).toBe(2);
    expect(s.checks.average).toBeCloseTo((0.7 + 0.6 + 1) / 3);
    expect(formatSummary(s).at(-1)).toBe('기준 3. 체크율 70% 이상인 주: 67% (2/3), 평균 체크율 77%');
  });

  it('평가 세트 대화(-eval-)는 모든 기준에서 뺀다', () => {
    const s = summarize(
      [row({ conversationId: 'u1-eval-x', weekStart: '2026-11-09', cells: 14, edits: 9, profileEdits: 5, checks: 0 })],
      TODAY,
    );
    expect([s.profiles.total, s.weeks.total, s.checks.ended]).toEqual([0, 0, 0]);
  });
});
