// docs/experiments/data/에 남긴 실제 모델 결과를 지금 checkPlan으로 다시 점검한다 (LLM을 부르지 않음).
// 규칙을 바꿔 이 테스트가 깨지면, 예전 실험 결과의 판정이 바뀐 것이다.
// 의도한 변경이면 기대값과 docs/experiments/의 해당 문서 표를 함께 고친다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classesA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { classesB, classesC, classesD, profileB, profileC, profileD } from './__fixtures__/personas.ts';
import { checkPlan } from './check-plan.ts';
import { buildCriteria } from './criteria.ts';
import type { MenuClassification, Plan, PlanCell, Profile } from './types.ts';

const DATA = new URL('../../docs/experiments/data/', import.meta.url);
const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as T;

/** 옛 실험의 칸에는 ingredients가 없는 것도 있어 기본값을 채운다. */
function planOf(cells: Partial<PlanCell>[]): Plan {
  return {
    planId: 'experiment',
    userId: profileA.userId,
    profileVersion: profileA.version,
    weekStart: '2026-11-09',
    events: [],
    createdAt: '',
    cells: cells.map((c) => ({ ingredients: [], ...c }) as PlanCell),
  };
}

const rulesOf = (plan: Plan) =>
  checkPlan(plan, profileA, classesA, rulesA).violations.map((v) => (v.detail ? `${v.rule}(${v.detail})` : v.rule));

describe('2026-11-04 1주일 생성 방식 A/B', () => {
  const data = load<{
    B: { cells: Partial<PlanCell>[] }[];
    A: { run: number; days: { cells: Partial<PlanCell>[] }[] }[];
  }>('2026-11-04-week-plan-a-vs-b.json');

  it.each([0, 1])('B %i회차(한 번에 14칸)는 통과', (i) => {
    expect(rulesOf(planOf(data.B[i]!.cells))).toEqual([]);
  });

  it('A 1회차(요일별)는 다양성 규칙에 4개 걸린다', () => {
    expect(rulesOf(planOf(data.A[0]!.days.flatMap((d) => d.cells)))).toEqual([
      'same_meal_consecutive_days',
      'same_meal_consecutive_days',
      'menu_weekly_limit(회덮밥)',
      'menu_weekly_limit(닭가슴살 채소 볶음)',
    ]);
  });

  it('A 2회차(요일별)는 다양성 규칙에 6개 걸린다', () => {
    expect(rulesOf(planOf(data.A[1]!.days.flatMap((d) => d.cells)))).toEqual([
      ...Array(5).fill('same_meal_consecutive_days'),
      'menu_weekly_limit(회덮밥)',
    ]);
  });
});

describe('2026-11-06 실제 루프', () => {
  it.each([
    '2026-11-06-t1-5-first-loop.json',
    '2026-11-06-t1-6-eval-persona-a.json',
    '2026-11-06-b1-ui-real-run.json',
    '2026-11-06-b2-edit-real-run.json', // 칸 수정 뒤 식단표
    '2026-11-06-b9-first-deploy.json', // 배포본 평가 세트
  ])('%s는 통과', (file) => {
    const { output } = load<{ output: { plan: Plan } }>(file);
    expect(rulesOf(output.plan)).toEqual([]);
  });
});

describe('2026-11-07 평가 세트 A~D (T1-7)', () => {
  it('통과한 페르소나 A 2회는 지금 규칙으로도 통과', () => {
    const { runs } = load<{ runs: { persona: string; result: string; output?: { plan: Plan } }[] }>(
      '2026-11-07-t1-7-eval-personas.json',
    );
    const passed = runs.filter((r) => r.persona === '페르소나A' && r.result === 'pass');
    expect(passed).toHaveLength(2);
    for (const r of passed) expect(rulesOf(r.output!.plan)).toEqual([]);
  });

  // 같은 날 저녁 B~D 재실행. 평가 세트와 같이 buildCriteria(goals)로 점검한다
  const personas: Record<string, { profile: Profile; classes: MenuClassification[] }> = {
    페르소나B: { profile: profileB, classes: classesB },
    페르소나C: { profile: profileC, classes: classesC },
    페르소나D: { profile: profileD, classes: classesD },
  };
  const { runs } = load<{ runs: { persona: string; run: number; result: string; output: { plan: Plan } }[] }>(
    '2026-11-07-t1-7-eval-personas-bcd.json',
  );
  it.each(runs.map((r) => [r.persona, r.run, r] as const))('%s %i회차는 지금 규칙으로도 통과', (persona, _run, r) => {
    const { profile, classes } = personas[persona]!;
    expect(r.result).toBe('pass');
    expect(checkPlan(r.output.plan, profile, classes, buildCriteria(profile.goals)).violations).toEqual([]);
  });
});

describe('2026-11-07 B11 추론 수준 low (T8-2)', () => {
  const personas: Record<string, { profile: Profile; classes: MenuClassification[] }> = {
    페르소나A: { profile: profileA, classes: classesA },
    페르소나B: { profile: profileB, classes: classesB },
    페르소나C: { profile: profileC, classes: classesC },
    페르소나D: { profile: profileD, classes: classesD },
  };
  const { runs } = load<{ runs: { persona: string; run: number; result: string; output: { plan: Plan } }[] }>(
    '2026-11-07-b11-thinking-low.json',
  );
  it.each(runs.map((r) => [r.persona, r.run, r] as const))('%s %i회차는 지금 규칙으로도 통과', (persona, _run, r) => {
    const { profile, classes } = personas[persona]!;
    expect(r.result).toBe('pass');
    expect(checkPlan(r.output.plan, profile, classes, buildCriteria(profile.goals)).violations).toEqual([]);
  });
});
