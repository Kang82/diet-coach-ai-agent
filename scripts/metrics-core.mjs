// 효과 측정 집계 (tasks.md T26, Task2 R4). 기획서 diet-coach-agent-screener.md 5장의 성공 기준을 숫자로 본다.
// scripts/metrics.mjs가 D1 conversations·plan_checks에서 숫자와 날짜만 읽어 이 함수에 넘긴다. 사용자 ID는 출력하지 않는다.
//   기준 1 (첫 시연): 프로필에서 고친 항목이 1개 이하인 경우가 10명 중 8명 이상
//   기준 2 (정식 운영): 고친 칸이 3개 이하인 주가 4주 중 3주 이상
//   기준 3 (정식 운영): 체크한 끼니가 계획한 끼니의 70% 이상

export const PROFILE_EDITS_OK = 1;
export const PLAN_EDITS_OK = 3;
export const WEEKS_FOR_USER = 4;
export const USER_WEEKS_SHARE = 0.75;
export const CHECK_RATE_OK = 0.7;

/**
 * @typedef {{ userId: string, conversationId: string, weekStart: string | null, cells: number | null,
 *   edits: number | null, profileEdits: number | null, checks: number }} MetricRow
 */

/** 'YYYY-MM-DD'에 days일을 더한다 (UTC) */
function addDays(day, days) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ratio = (part, total) => (total > 0 ? part / total : null);

/**
 * @param {MetricRow[]} rows
 * @param {string} today UTC 'YYYY-MM-DD'. 시작 월요일 + 7일이 오늘 이하인 주만 "끝난 주"로 체크율에 넣는다
 */
export function summarize(rows, today) {
  // 평가 세트 대화는 뺀다 (src/evals, 대화 ID에 -eval-)
  const real = rows.filter((r) => !r.conversationId.includes('-eval-'));

  const profiles = real.filter((r) => r.profileEdits !== null);
  const profilesOk = profiles.filter((r) => r.profileEdits <= PROFILE_EDITS_OK).length;

  const weeks = real.filter((r) => r.weekStart !== null && r.cells !== null && r.cells > 0);
  const weeksOk = weeks.filter((r) => (r.edits ?? 0) <= PLAN_EDITS_OK).length;

  // 사용자별: 처음 나온 순서로 순번만 준다
  const byUser = new Map();
  for (const r of weeks) {
    const u = byUser.get(r.userId) ?? { weeks: 0, ok: 0 };
    u.weeks += 1;
    if ((r.edits ?? 0) <= PLAN_EDITS_OK) u.ok += 1;
    byUser.set(r.userId, u);
  }
  const users = [...byUser.values()].map((u, i) => ({
    index: i + 1,
    weeks: u.weeks,
    ok: u.ok,
    meets: u.weeks >= WEEKS_FOR_USER ? u.ok / u.weeks >= USER_WEEKS_SHARE : null,
  }));

  const ended = weeks.filter((r) => addDays(r.weekStart, 7) <= today);
  const rates = ended.map((r) => Math.min(r.checks, r.cells) / r.cells);
  const checksOk = rates.filter((rate) => rate >= CHECK_RATE_OK).length;

  return {
    profiles: { total: profiles.length, ok: profilesOk, rate: ratio(profilesOk, profiles.length) },
    weeks: { total: weeks.length, ok: weeksOk, rate: ratio(weeksOk, weeks.length), users },
    checks: {
      ended: ended.length,
      ok: checksOk,
      rate: ratio(checksOk, ended.length),
      average: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    },
  };
}

const pct = (value) => (value === null ? '데이터 없음' : `${Math.round(value * 100)}%`);

/** 출력할 줄 */
export function formatSummary(s) {
  const lines = [
    `기준 1. 프로필에서 고친 항목 ${PROFILE_EDITS_OK}개 이하 (목표 80% 이상): ${pct(s.profiles.rate)} (${s.profiles.ok}/${s.profiles.total})`,
    `기준 2. 고친 칸 ${PLAN_EDITS_OK}개 이하인 주: ${pct(s.weeks.rate)} (${s.weeks.ok}/${s.weeks.total})`,
  ];
  for (const u of s.weeks.users) {
    const verdict = u.meets === null ? `${WEEKS_FOR_USER}주 미만` : u.meets ? '충족' : '미충족';
    lines.push(`  사용자 ${u.index}: ${u.ok}/${u.weeks}주 (${verdict})`);
  }
  lines.push(
    s.checks.ended === 0
      ? '기준 3. 체크율 70% 이상인 주: 끝난 주 없음'
      : `기준 3. 체크율 70% 이상인 주: ${pct(s.checks.rate)} (${s.checks.ok}/${s.checks.ended}), 평균 체크율 ${pct(s.checks.average)}`,
  );
  return lines;
}
