// 스펙 4.1 nextField, 초안 병합과 마무리. 8.4
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { finishDraft, mergeDraft, nextField, profileFromInterview } from './interview.ts';
import type { DraftMealSetting, InterviewDraft } from './types.ts';

/** 페르소나 A의 인터뷰가 끝난 초안. 주말 집밥은 조리 시간 "상관없다" */
function draftA(): InterviewDraft {
  const { goals, goalNote, medication, avoid, avoidNote } = structuredClone(profileA);
  const meals: DraftMealSetting[] = structuredClone(profileA.meals).map((m) =>
    m.place === 'home' && m.cookMinutes === undefined ? { ...m, cookMinutes: null } : m,
  );
  return { goals, goalNote, medication, avoid, avoidNote, meals };
}

const skipAll = (): DraftMealSetting[] =>
  (['weekday', 'weekend'] as const).flatMap((dayType) =>
    (['breakfast', 'lunch', 'dinner'] as const).map((meal) => ({ dayType, meal, place: 'skip' as const })),
  );

describe('nextField', () => {
  it('빈 초안 → goals', () => {
    expect(nextField({})).toBe('goals');
  });

  it('goals가 비어 있어도 goals', () => {
    expect(nextField({ goals: [] })).toBe('goals');
  });

  it('감량만이면 medication을 건너뛰고 avoid', () => {
    expect(nextField({ goals: ['weight_loss'] })).toBe('avoid');
  });

  it.each([['blood_glucose'], ['cholesterol']] as const)('%s 목표가 있으면 medication', (goal) => {
    expect(nextField({ goals: ['weight_loss', goal] })).toBe('medication');
  });

  it('avoid가 []("없음")면 meals', () => {
    expect(nextField({ goals: ['weight_loss'], avoid: [] })).toBe('meals');
  });

  it('6개 조합 중 일부만 있으면 meals', () => {
    expect(nextField({ goals: ['weight_loss'], avoid: [], meals: skipAll().slice(0, 5) })).toBe('meals');
  });

  it('끼니는 있지만 place가 없으면 meals', () => {
    const meals = skipAll();
    meals[4] = { dayType: 'weekend', meal: 'lunch' };
    expect(nextField({ goals: ['weight_loss'], avoid: [], meals })).toBe('meals');
  });

  it('외식 끼니마다 시간순으로 menusFor, 그다음 집밥 끼니마다 cookMinutesFor', () => {
    const draft = draftA();
    for (const m of draft.meals!) {
      delete m.menus;
      delete m.cookMinutes;
    }
    draft.meals![5] = { dayType: 'weekend', meal: 'dinner', place: 'eat_out', companions: 'family' };

    const asked = [];
    for (let field = nextField(draft); field !== null; field = nextField(draft)) {
      asked.push(field);
      if (typeof field === 'object' && 'menusFor' in field) {
        draft.meals!.find((m) => m.dayType === field.menusFor.dayType && m.meal === field.menusFor.meal)!.menus = ['백반'];
      } else if (typeof field === 'object' && 'cookMinutesFor' in field) {
        draft.meals!.find(
          (m) => m.dayType === field.cookMinutesFor.dayType && m.meal === field.cookMinutesFor.meal,
        )!.cookMinutes = 20;
      } else {
        throw new Error(`예상하지 못한 질문: ${String(field)}`);
      }
    }
    expect(asked).toEqual([
      { menusFor: { dayType: 'weekday', meal: 'lunch' } },
      { menusFor: { dayType: 'weekend', meal: 'dinner' } },
      { cookMinutesFor: { dayType: 'weekday', meal: 'dinner' } },
      { cookMinutesFor: { dayType: 'weekend', meal: 'lunch' } },
    ]);
  });

  it('공백뿐인 메뉴는 없는 것으로 본다', () => {
    const draft = draftA();
    draft.meals![1]!.menus = ['  '];
    expect(nextField(draft)).toEqual({ menusFor: { dayType: 'weekday', meal: 'lunch' } });
  });

  it('조리 시간이 null("상관없다")이면 다시 묻지 않는다', () => {
    expect(nextField(draftA())).toBeNull();
  });
});

describe('mergeDraft', () => {
  it('끼니는 (dayType, meal)끼리 필드 단위로 합친다', () => {
    const draft = draftA();
    const merged = mergeDraft(draft, { meals: [{ dayType: 'weekday', meal: 'lunch', menus: ['김밥'] }] });
    expect(merged.meals![1]).toEqual({ ...profileA.meals[1], menus: ['김밥'] });
    expect(merged.meals).toHaveLength(6);
  });

  it('새 끼니는 더하고 끼니 순서로 정렬한다', () => {
    const merged = mergeDraft(
      { meals: [{ dayType: 'weekend', meal: 'dinner', place: 'home' }] },
      { meals: [{ dayType: 'weekday', meal: 'breakfast', place: 'skip' }] },
    );
    expect(merged.meals).toEqual([
      { dayType: 'weekday', meal: 'breakfast', place: 'skip' },
      { dayType: 'weekend', meal: 'dinner', place: 'home' },
    ]);
  });

  it('filled에 없는(undefined) 값은 지우지 않는다', () => {
    const merged = mergeDraft(draftA(), { goals: undefined, avoid: [] });
    expect(merged.goals).toEqual(profileA.goals);
    expect(merged.avoid).toEqual([]);
  });

  it('원래 초안을 바꾸지 않는다', () => {
    const draft = draftA();
    const before = structuredClone(draft);
    mergeDraft(draft, { goals: ['weight_loss'], meals: [{ dayType: 'weekday', meal: 'lunch', menus: ['김밥'] }] });
    expect(draft).toEqual(before);
  });
});

describe('finishDraft', () => {
  it('페르소나 A 초안 → 프로필의 인터뷰 항목 (null 조리 시간은 지움)', () => {
    const { userId: _u, version: _v, consentedAt: _c, updatedAt: _t, ...expected } = profileA;
    expect(finishDraft(draftA())).toEqual(expected);
  });

  it('혈당·콜레스테롤 목표가 없으면 medication은 "none"', () => {
    const draft = { ...draftA(), goals: ['weight_loss' as const], medication: 'cholesterol' as const };
    expect(finishDraft(draft).medication).toBe('none');
  });

  it('companions가 없으면 "alone", 외식이 아닌 끼니의 menus와 집밥이 아닌 끼니의 cookMinutes는 지운다', () => {
    const draft = draftA();
    draft.meals![0] = { dayType: 'weekday', meal: 'breakfast', place: 'skip', menus: ['토스트'], cookMinutes: 5 };
    expect(finishDraft(draft).meals[0]).toEqual({
      dayType: 'weekday',
      meal: 'breakfast',
      place: 'skip',
      companions: 'alone',
    });
  });

  it('인터뷰가 끝나지 않았으면 에러', () => {
    expect(() => finishDraft({ goals: ['weight_loss'] })).toThrow();
  });
});

describe('profileFromInterview', () => {
  it('동의 시각이 있으면 그대로 쓴다', () => {
    const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
    const result = { goals, goalNote, medication, avoid, avoidNote, meals, consentedAt: '2026-11-06T01:00:00.000Z' };
    expect(profileFromInterview(result, new Date('2026-11-06T02:00:00Z')).consentedAt).toBe('2026-11-06T01:00:00.000Z');
  });

  it('인터뷰 결과에 임시 사용자 ID, 버전 0, 빈 동의 시각을 붙인다', () => {
    const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
    const result = { goals, goalNote, medication, avoid, avoidNote, meals };
    expect(profileFromInterview(result, new Date('2026-11-06T01:00:00Z'))).toEqual({
      ...profileA,
      userId: 'demo',
      version: 0,
      consentedAt: '',
      updatedAt: '2026-11-06T01:00:00.000Z',
    });
  });
});
