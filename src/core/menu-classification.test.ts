// 스펙 1.3, 4.2 외식 메뉴 분류 (tasks.md B5)
import { describe, expect, it } from 'vitest';
import { classesA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import {
  applyClassOverrides,
  buildClassifyPrompt,
  checkClassification,
  classesForPlan,
  classificationTargets,
  normalizeClassifications,
  AVOID_TAG_REASON_PREFIX,
  AVOID_TAG_REASON_SUFFIX,
  USER_CHOSEN_REASON,
} from './menu-classification.ts';
import { FINISH_ONLY } from './plan-prompt.ts';
import type { MealSetting, MenuClassification } from './types.ts';

const skip = (dayType: MealSetting['dayType'], meal: MealSetting['meal']): MealSetting => ({
  dayType,
  meal,
  place: 'skip',
  companions: 'alone',
});

describe('classificationTargets', () => {
  it('페르소나 A: 평일 점심 메뉴 그대로', () => {
    expect(classificationTargets(profileA.meals)).toEqual(['국밥', '백반', '돈가스', '쌀국수', '회덮밥']);
  });

  it('외식 끼니를 끼니 순서(평일 아침 → 주말 저녁)로 합치고 중복은 처음 것만', () => {
    const meals: MealSetting[] = [
      { dayType: 'weekend', meal: 'dinner', place: 'eat_out', companions: 'family', menus: ['삼겹살', '백반'] },
      skip('weekday', 'breakfast'),
      { dayType: 'weekday', meal: 'lunch', place: 'eat_out', companions: 'others', menus: ['백반', ' 국밥 '] },
      skip('weekday', 'dinner'),
      skip('weekend', 'breakfast'),
      skip('weekend', 'lunch'),
    ];
    expect(classificationTargets(meals)).toEqual(['백반', '국밥', '삼겹살']);
  });

  it('빈 문자열은 빼고, 외식 끼니가 없으면 빈 목록', () => {
    expect(classificationTargets([{ ...skip('weekday', 'lunch'), place: 'eat_out', menus: [' ', '김밥'] }])).toEqual([
      '김밥',
    ]);
    expect(classificationTargets([skip('weekday', 'lunch'), { ...skip('weekday', 'dinner'), place: 'home' }])).toEqual([]);
  });
});

describe('checkClassification', () => {
  const targets = ['국밥', '백반', '돈가스'];

  it('대상과 1:1이면 문제 없음 (순서는 상관없음)', () => {
    expect(checkClassification(targets, [{ menu: '돈가스' }, { menu: '국밥' }, { menu: '백반' }])).toEqual([]);
  });

  it('빠진 메뉴, 추가된 메뉴, 두 번 나온 메뉴', () => {
    expect(
      checkClassification(targets, [{ menu: '국밥' }, { menu: '국밥' }, { menu: '라면' }, { menu: '돈가스 ' }]),
    ).toEqual([
      { code: 'missing', menu: '백반' },
      { code: 'missing', menu: '돈가스' },
      { code: 'extra', menu: '라면' },
      { code: 'extra', menu: '돈가스 ' },
      { code: 'duplicate', menu: '국밥' },
    ]);
  });
});

describe('normalizeClassifications', () => {
  it('대상 순서로 정렬하고, 이번 기준에 없는 criterionIds와 빈 팁을 지운다', () => {
    const raw: MenuClassification[] = [
      {
        menu: '돈가스',
        class: 'weekly_max_1',
        reason: ' 튀김 ',
        criterionIds: ['reduce_refined_carbs', 'reduce_saturated_fat', 'reduce_saturated_fat'],
        orderTips: [' 소스 따로 ', ''],
      },
      { menu: '국밥', class: 'often', reason: '국물', criterionIds: [], orderTips: [] },
    ];
    expect(normalizeClassifications(['국밥', '돈가스'], raw, rulesA)).toEqual([
      { menu: '국밥', class: 'often', reason: '국물', criterionIds: [], orderTips: [] },
      {
        menu: '돈가스',
        class: 'weekly_max_1',
        reason: '튀김',
        criterionIds: ['reduce_saturated_fat'],
        orderTips: ['소스 따로'],
      },
    ]);
  });

  it('태그는 선언 순서로 중복 없이, 태그가 없는 예전 분류는 그대로 없음 (T13-4)', () => {
    const raw: MenuClassification[] = [
      { menu: '국밥', class: 'often', reason: '국물', criterionIds: [], orderTips: [], tags: ['refined_carb_main', 'pork', 'meat', 'pork'] },
      { menu: '백반', class: 'often', reason: '반찬', criterionIds: [], orderTips: [] },
    ];
    const out = normalizeClassifications(['국밥', '백반'], raw, rulesA);
    expect(out[0]!.tags).toEqual(['meat', 'pork', 'refined_carb_main']);
    expect(out[1]).not.toHaveProperty('tags');
  });

  it('태그가 피할 음식에 걸리면 피하기로 바꾸고 이유를 적는다. meat는 돼지고기도 포함 (T13-4)', () => {
    const raw: MenuClassification[] = [
      { menu: '김밥', class: 'often', reason: '채소', criterionIds: [], orderTips: ['밥 양 줄이기'], tags: ['egg', 'fish'] },
      { menu: '국밥', class: 'weekly_max_1', reason: '국물', criterionIds: [], orderTips: [], tags: ['pork'] },
      { menu: '돈가스', class: 'avoid', reason: '튀김', criterionIds: [], orderTips: [], tags: ['pork', 'fried'] },
      { menu: '샐러드', class: 'often', reason: '채소', criterionIds: [], orderTips: [], tags: [] },
    ];
    const out = normalizeClassifications(['김밥', '국밥', '돈가스', '샐러드'], raw, rulesA, ['fish', 'meat']);
    expect(out.map((c) => [c.menu, c.class, c.reason])).toEqual([
      ['김밥', 'avoid', `${AVOID_TAG_REASON_PREFIX}생선${AVOID_TAG_REASON_SUFFIX}`],
      ['국밥', 'avoid', `${AVOID_TAG_REASON_PREFIX}돼지고기${AVOID_TAG_REASON_SUFFIX}`],
      ['돈가스', 'avoid', '튀김'],
      ['샐러드', 'often', '채소'],
    ]);
    expect(out[0]!.orderTips).toEqual(['밥 양 줄이기']);
  });

  it('사용자가 직접 정한 분류는 피할 음식 태그가 있어도 바꾸지 않는다 (T13-4)', () => {
    const raw: MenuClassification[] = [
      { menu: '김밥', class: 'often', reason: USER_CHOSEN_REASON, criterionIds: [], orderTips: [], tags: ['fish'] },
    ];
    expect(normalizeClassifications(['김밥'], raw, rulesA, ['fish'])[0]).toMatchObject({ class: 'often', reason: USER_CHOSEN_REASON });
  });

  it('1:1이 아니면 에러', () => {
    expect(() => normalizeClassifications(['국밥', '백반'], [classesA[3]!], rulesA)).toThrow(/백반/);
  });
});

describe('applyClassOverrides', () => {
  it('바꾼 메뉴는 class와 reason이 바뀌고 주문 팁은 그대로', () => {
    const out = applyClassOverrides(classesA, [{ menu: '돈가스', class: 'avoid' }]);
    expect(out.find((c) => c.menu === '돈가스')).toEqual({
      menu: '돈가스',
      class: 'avoid',
      reason: USER_CHOSEN_REASON,
      criterionIds: ['reduce_portion_calories', 'reduce_saturated_fat'],
      orderTips: ['밥 반 공기', '소스 따로'],
    });
    expect(out.filter((c) => c.menu !== '돈가스')).toEqual(classesA.filter((c) => c.menu !== '돈가스'));
  });

  it('같은 값이거나 모르는 메뉴면 그대로, 원본은 고치지 않는다', () => {
    const before = structuredClone(classesA);
    const out = applyClassOverrides(classesA, [
      { menu: '국밥', class: 'weekly_max_1' },
      { menu: '라면', class: 'avoid' },
    ]);
    expect(out).toEqual(classesA);
    expect(classesA).toEqual(before);
  });
});

describe('buildClassifyPrompt', () => {
  it('대상 메뉴, 기준, 피할 음식, 분류 값이 들어간다', () => {
    const prompt = buildClassifyPrompt({ menus: ['국밥', '돈가스'], rules: rulesA, avoid: ['dairy'] });
    for (const text of ['"국밥"', '"돈가스"', '포화지방 줄이기', 'reduce_saturated_fat', '유제품', 'often', 'weekly_max_1', 'avoid']) {
      expect(prompt).toContain(text);
    }
    expect(prompt).not.toContain('reduce_refined_carbs');
    // B14: 도구 안 프롬프트는 에이전트 지시·도구를 물려받으므로 finish만 부르라고 맨 앞에 적는다
    expect(prompt.split('\n')[0]).toBe(FINISH_ONLY);
  });

  it('태그는 묻지 않는다 (B23에서 되돌림: 메뉴가 많으면 시간 제한·Neuron 초과)', () => {
    expect(buildClassifyPrompt({ menus: ['국밥'], rules: rulesA, avoid: [] })).not.toContain('tags:');
  });

  it('피할 음식이 없으면 그 줄을 뺀다', () => {
    expect(buildClassifyPrompt({ menus: ['국밥'], rules: rulesA, avoid: [] })).not.toContain('피할 음식:');
  });
});

describe('classesForPlan', () => {
  it('저장된 분류에 수정을 반영한다', () => {
    const out = classesForPlan(profileA.meals, classesA, [{ menu: '국밥', class: 'avoid' }]);
    expect(out?.find((c) => c.menu === '국밥')?.class).toBe('avoid');
  });

  it('외식 끼니가 없으면 빈 배열, 저장된 분류가 없거나 메뉴와 맞지 않으면 undefined', () => {
    const noEatOut = profileA.meals.map((m) => (m.place === 'eat_out' ? { ...m, place: 'skip' as const } : m));
    expect(classesForPlan(noEatOut, undefined)).toEqual([]);
    expect(classesForPlan(profileA.meals, undefined)).toBeUndefined();
    expect(classesForPlan(profileA.meals, classesA.slice(1))).toBeUndefined();
  });
});
