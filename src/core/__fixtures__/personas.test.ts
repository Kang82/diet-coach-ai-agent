// 평가 세트 페르소나 픽스처가 서로 맞는지 (T1-7). 틀리면 평가 결과가 모델 탓인지 픽스처 탓인지 가릴 수 없다.
import { describe, expect, it } from 'vitest';
import { buildCriteria } from '../criteria.ts';
import { validateProfile } from '../profile-validation.ts';
import type { MenuClassification, Profile } from '../types.ts';
import { classesA, profileA } from './persona-a.ts';
import { classesB, classesC, classesD, classesE, profileB, profileC, profileD, profileE } from './personas.ts';

const personas: [string, Profile, MenuClassification[]][] = [
  ['A', profileA, classesA],
  ['B', profileB, classesB],
  ['C', profileC, classesC],
  ['D', profileD, classesD],
  ['E', profileE, classesE],
];

describe.each(personas)('페르소나 %s', (_, profile, classes) => {
  it('프로필 검증을 통과한다', () => {
    expect(validateProfile(profile)).toEqual([]);
  });

  it('분류한 메뉴가 외식 메뉴 목록과 같다 (중복 없음)', () => {
    const menus = profile.meals.flatMap((m) => (m.place === 'eat_out' ? (m.menus ?? []) : []));
    expect(classes.map((c) => c.menu).sort()).toEqual([...new Set(menus)].sort());
  });

  it('분류의 기준은 그 목표의 기준 안에 있다', () => {
    const allowed = buildCriteria(profile.goals).criteria;
    for (const c of classes) {
      expect(c.criterionIds.length).toBeGreaterThan(0);
      for (const id of c.criterionIds) expect(allowed).toContain(id);
    }
  });
});
