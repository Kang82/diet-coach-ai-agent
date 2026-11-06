// 스펙 1.2 프로필 검증, 8.4
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { validateProfile } from './profile-validation.ts';
import type { Profile } from './types.ts';

const clone = (): Profile => structuredClone(profileA);

describe('validateProfile', () => {
  it('페르소나 A는 통과', () => {
    expect(validateProfile(profileA)).toEqual([]);
  });

  it('조합이 빠지면 빠진 끼니마다 meal_missing', () => {
    const p = clone();
    p.meals = p.meals.filter((m) => !(m.dayType === 'weekend' && m.meal !== 'dinner'));
    expect(validateProfile(p)).toEqual([
      { code: 'meal_missing', meal: { dayType: 'weekend', meal: 'breakfast' } },
      { code: 'meal_missing', meal: { dayType: 'weekend', meal: 'lunch' } },
    ]);
  });

  it('같은 조합이 두 번이면 meal_duplicate', () => {
    const p = clone();
    p.meals.push({ dayType: 'weekday', meal: 'dinner', place: 'skip', companions: 'alone' });
    expect(validateProfile(p)).toEqual([{ code: 'meal_duplicate', meal: { dayType: 'weekday', meal: 'dinner' } }]);
  });

  it.each([
    ['없음', undefined],
    ['빈 목록', []],
    ['공백만', ['  ', '']],
  ])('외식 끼니의 menus가 %s이면 menus_required', (_, menus) => {
    const p = clone();
    p.meals[1]!.menus = menus;
    expect(validateProfile(p)).toEqual([{ code: 'menus_required', meal: { dayType: 'weekday', meal: 'lunch' } }]);
  });

  it('외식이 아닌 끼니는 menus가 없어도 된다', () => {
    const p = clone();
    p.meals[2]!.menus = undefined;
    expect(validateProfile(p)).toEqual([]);
  });

  it('goals가 비면 goals_empty', () => {
    const p = clone();
    p.goals = [];
    expect(validateProfile(p)).toEqual([{ code: 'goals_empty' }]);
  });

  it('goals가 중복이면 goals_duplicate', () => {
    const p = clone();
    p.goals = ['weight_loss', 'cholesterol', 'weight_loss'];
    expect(validateProfile(p)).toEqual([{ code: 'goals_duplicate' }]);
  });

  it('혈당·콜레스테롤 목표가 없는데 약 복용이 있으면 medication_without_goal', () => {
    const p = clone();
    p.goals = ['weight_loss'];
    p.medication = 'cholesterol';
    expect(validateProfile(p)).toEqual([{ code: 'medication_without_goal' }]);
  });

  it('콜레스테롤 목표가 있으면 약 복용이 있어도 된다', () => {
    const p = clone();
    p.medication = 'cholesterol';
    expect(validateProfile(p)).toEqual([]);
  });

  it('동의 시각이 없으면 consent_missing', () => {
    const p = clone();
    p.consentedAt = '';
    expect(validateProfile(p)).toEqual([{ code: 'consent_missing' }]);
  });

  it('여러 문제는 정해진 순서로, 같은 code 안에서는 끼니 순서로', () => {
    const p = clone();
    p.goals = [];
    p.consentedAt = '';
    p.meals = p.meals.filter((m) => m.meal !== 'breakfast');
    p.meals.push({ dayType: 'weekend', meal: 'dinner', place: 'eat_out', companions: 'alone' });
    p.meals[0]!.menus = [];
    expect(validateProfile(p)).toEqual([
      { code: 'goals_empty' },
      { code: 'meal_missing', meal: { dayType: 'weekday', meal: 'breakfast' } },
      { code: 'meal_missing', meal: { dayType: 'weekend', meal: 'breakfast' } },
      { code: 'meal_duplicate', meal: { dayType: 'weekend', meal: 'dinner' } },
      { code: 'menus_required', meal: { dayType: 'weekday', meal: 'lunch' } },
      { code: 'menus_required', meal: { dayType: 'weekend', meal: 'dinner' } },
      { code: 'consent_missing' },
    ]);
  });
});
