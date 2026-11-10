import { describe, expect, it } from 'vitest';
import { planA } from '../core/__fixtures__/persona-a.ts';
import { checkSummary, fetchChecks, isChecked, parseChecks, saveCheck, withCheck } from './plan-checks.ts';

describe('먹었어요 체크 화면 상태 (T25)', () => {
  it('withCheck는 넣으면 칸 순서로, 같은 칸은 하나만, 빼면 빠진다', () => {
    let checks = withCheck([], { day: 'tue', meal: 'lunch' }, true);
    checks = withCheck(checks, { day: 'mon', meal: 'dinner' }, true);
    checks = withCheck(checks, { day: 'mon', meal: 'dinner' }, true);
    expect(checks).toEqual([
      { day: 'mon', meal: 'dinner' },
      { day: 'tue', meal: 'lunch' },
    ]);
    expect(withCheck(checks, { day: 'mon', meal: 'dinner' }, false)).toEqual([{ day: 'tue', meal: 'lunch' }]);
    expect(isChecked(checks, { day: 'tue', meal: 'lunch' })).toBe(true);
    expect(isChecked(checks, { day: 'tue', meal: 'dinner' })).toBe(false);
  });

  it('요약은 식단표 칸만 센다 (식단표에 없는 칸 체크는 빼고)', () => {
    const [first, second] = planA.cells;
    const checks = [first!, second!, { day: 'sun', meal: 'breakfast' } as const].map((c) => ({ day: c.day, meal: c.meal }));
    const inPlan = planA.cells.some((c) => c.day === 'sun' && c.meal === 'breakfast');
    expect(checkSummary(planA.cells, checks)).toBe(`이번 주 ${inPlan ? 3 : 2}/${planA.cells.length}칸 먹었어요`);
    expect(checkSummary(planA.cells, [])).toBe(`이번 주 0/${planA.cells.length}칸 먹었어요`);
  });

  it('parseChecks는 모양이 틀린 항목을 버리고 칸 순서로', () => {
    expect(
      parseChecks({ checks: [{ day: 'wed', meal: 'lunch' }, { day: 'xx', meal: 'lunch' }, null, { day: 'mon', meal: 'lunch', x: 1 }] }),
    ).toEqual([
      { day: 'mon', meal: 'lunch' },
      { day: 'wed', meal: 'lunch' },
    ]);
    expect(parseChecks(null)).toEqual([]);
    expect(parseChecks({ checks: 'no' })).toEqual([]);
  });
});

describe('체크 API (T25)', () => {
  const respond = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('fetchChecks: 성공이면 목록, 실패·네트워크 오류면 null', async () => {
    expect(await fetchChecks('t', 'u-1', respond(200, { checks: [{ day: 'mon', meal: 'lunch' }] }))).toEqual([
      { day: 'mon', meal: 'lunch' },
    ]);
    expect(await fetchChecks('t', 'u-1', respond(403, {}))).toBeNull();
    const offline = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await fetchChecks('t', 'u-1', offline)).toBeNull();
  });

  it('saveCheck: PUT 본문과 토큰을 보내고, 429는 서버 문구, 그 밖의 실패는 기본 문구', async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const ok = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await saveCheck('t', 'u-1', { day: 'fri', meal: 'dinner' }, true, ok)).toEqual({ ok: true });
    expect(sent?.url).toBe('/api/checks/u-1');
    expect(sent?.init.method).toBe('PUT');
    expect(JSON.parse(String(sent?.init.body))).toEqual({ day: 'fri', meal: 'dinner', eaten: true });
    expect((sent?.init.headers as Record<string, string>).authorization).toBe('Bearer t');

    const limited = respond(429, { error: { type: 'check_limit', message: '오늘은 그만', details: '' } });
    expect(await saveCheck('t', 'u-1', { day: 'fri', meal: 'dinner' }, true, limited)).toEqual({ ok: false, message: '오늘은 그만' });
    const failed = await saveCheck('t', 'u-1', { day: 'fri', meal: 'dinner' }, true, respond(500, {}));
    expect(failed.ok).toBe(false);
  });
});
