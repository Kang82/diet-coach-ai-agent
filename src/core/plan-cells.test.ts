// LLM이 만든 칸을 코드가 정리한다 (B17, tasks.md T13-2·T13-3)
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { finishCells } from './plan-cells.ts';
import type { MenuClassification, PlanCell, Profile } from './types.ts';

const cellOf = (day: PlanCell['day'], meal: PlanCell['meal']) =>
  structuredClone(planA.cells.find((c) => c.day === day && c.meal === meal)!);

const finishOne = (cell: PlanCell, classes: readonly MenuClassification[] = classesA, profile: Profile = profileA) =>
  finishCells([cell], profile, classes)[0]!;

describe('finishCells', () => {
  it('외식 칸 orderTip이 비어 있으면 그 메뉴 분류의 주문 팁을 이어 붙인다', () => {
    const cell = cellOf('thu', 'lunch'); // 돈가스: 분류 팁 '밥 반 공기', '소스 따로'
    delete cell.orderTip;

    expect(finishOne(cell).orderTip).toBe('밥 반 공기, 소스 따로');
  });

  it('모델이 쓴 팁보다 분류 팁이 우선이다 (다른 메뉴의 팁을 옮겨 적은 경우)', () => {
    const cell = { ...cellOf('mon', 'lunch'), orderTip: '견과류 빼기' }; // 회덮밥: 분류 팁 '초장 절반'

    expect(finishOne(cell).orderTip).toBe('초장 절반');
  });

  it('분류에 팁이 없으면 모델이 쓴 팁을 그대로 둔다', () => {
    const classes = structuredClone(classesA);
    classes.find((c) => c.menu === '회덮밥')!.orderTips = [];
    const cell = { ...cellOf('mon', 'lunch'), orderTip: '초장 따로' };

    expect(finishOne(cell, classes).orderTip).toBe('초장 따로');
  });

  it('외식 칸 title은 정규화한 menuId다 (괄호 팁을 떼어 낸다)', () => {
    const cell = { ...cellOf('tue', 'lunch'), menuId: '백반 (생선 반찬 고르기)', title: '백반 (생선 반찬 고르기)' };

    const out = finishOne(cell);

    expect(out.menuId).toBe('백반');
    expect(out.title).toBe('백반');
    expect(out.orderTip).toBe('생선 반찬 고르기');
  });

  it('괄호 메모가 있는 목록 메뉴는 title도 목록 글자 그대로다', () => {
    const profile = structuredClone(profileA);
    const lunch = profile.meals.find((m) => m.dayType === 'weekday' && m.meal === 'lunch')!;
    lunch.menus = [...(lunch.menus ?? []), '포케볼(생선 x)'];
    const classes: MenuClassification[] = [
      ...structuredClone(classesA),
      { menu: '포케볼(생선 x)', class: 'often', reason: '', criterionIds: [], orderTips: ['소스 적게'] },
    ];
    const cell = { ...cellOf('mon', 'lunch'), menuId: '포케볼', title: '포케볼 (소스 적게)' };

    const out = finishOne(cell, classes, profile);

    expect(out.menuId).toBe('포케볼(생선 x)');
    expect(out.title).toBe('포케볼(생선 x)');
    expect(out.orderTip).toBe('소스 적게');
  });

  it('집밥 칸은 menuId만 정규화하고 title·orderTip은 그대로 둔다', () => {
    const cell = { ...cellOf('tue', 'dinner'), menuId: '닭가슴살 샐러드 (간장 드레싱)', orderTip: '드레싱 따로' };

    const out = finishOne(cell);

    expect(out.menuId).toBe('닭가슴살 샐러드');
    expect(out.title).toBe('닭가슴살 샐러드 (간장 드레싱)');
    expect(out.orderTip).toBe('드레싱 따로');
  });
});
