// LLM이 만든 칸을 코드가 정리한다 (B17, tasks.md T13-2·T13-3)
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { checkPlan } from './check-plan.ts';
import { USER_CHOSEN_REASON } from './menu-classification.ts';
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

  it('주재료는 앞뒤 공백을 뗀다 (T18)', () => {
    const cell = { ...cellOf('tue', 'dinner'), mainIngredient: ' 닭가슴살 ' };
    expect(finishOne(cell).mainIngredient).toBe('닭가슴살');
  });
});

// T13-1: 생성 모델이 외식 칸 이유에 틀린 근거("고추장을 적게 넣어 열량 조절", 외식 비빔밥 "현미밥으로")를 썼다.
// 외식 칸 이유·근거 기준은 사용자가 분류 화면에서 확인한 메뉴 분류 값으로 코드가 채운다
describe('finishCells: 외식 칸 이유는 메뉴 분류 이유', () => {
  const wrong = { reason: '초장을 적게 넣어 열량을 낮춥니다.', criterionIds: ['reduce_portion_calories' as const] };

  it('외식 칸 이유와 근거 기준을 그 메뉴 분류 값으로 바꾼다', () => {
    const out = finishOne({ ...cellOf('mon', 'lunch'), ...wrong }); // 회덮밥
    expect(out.reason).toBe('생선과 채소 위주라 포화지방이 적음');
    expect(out.criterionIds).toEqual(['reduce_saturated_fat']);
  });

  it('괄호 메모가 붙은 menuId도 정규화한 뒤 분류를 찾는다', () => {
    const out = finishOne({ ...cellOf('tue', 'lunch'), menuId: '백반 (생선 반찬 고르기)', ...wrong });
    expect(out.reason).toBe('생선·나물 반찬을 고르면 포화지방이 적음');
    expect(out.criterionIds).toEqual(['reduce_saturated_fat', 'increase_fiber']);
  });

  it('주 1회 메뉴는 앞에 "이번 주 한 번만 넣었어요."를 붙인다', () => {
    const out = finishOne({ ...cellOf('thu', 'lunch'), ...wrong }); // 돈가스
    expect(out.reason).toBe('이번 주 한 번만 넣었어요. 튀김이라 포화지방과 열량이 많음');
  });

  it('사용자가 바꾼 분류(직접 정한 분류)나 빈 이유는 모델 이유 그대로, 빈 근거는 모델 근거 그대로', () => {
    const classes = structuredClone(classesA);
    classes.find((c) => c.menu === '회덮밥')!.reason = USER_CHOSEN_REASON;
    expect(finishOne({ ...cellOf('mon', 'lunch'), ...wrong }, classes)).toMatchObject(wrong);

    const empty = structuredClone(classesA);
    Object.assign(empty.find((c) => c.menu === '회덮밥')!, { reason: '  ', criterionIds: [] });
    expect(finishOne({ ...cellOf('mon', 'lunch'), ...wrong }, empty)).toMatchObject(wrong);

    const noCriteria = structuredClone(classesA);
    noCriteria.find((c) => c.menu === '회덮밥')!.criterionIds = [];
    expect(finishOne({ ...cellOf('mon', 'lunch'), ...wrong }, noCriteria)).toMatchObject({
      reason: '생선과 채소 위주라 포화지방이 적음',
      criterionIds: wrong.criterionIds,
    });
  });

  it('분류에 없는 외식 메뉴와 집밥 칸은 모델 이유 그대로', () => {
    expect(finishOne({ ...cellOf('mon', 'lunch'), menuId: '김밥', ...wrong })).toMatchObject(wrong);
    expect(finishOne({ ...cellOf('tue', 'dinner'), ...wrong })).toMatchObject(wrong);
  });

  it('바꾼 칸은 checkPlan의 이유 근거 규칙에 걸리지 않는다', () => {
    const plan = structuredClone(planA);
    plan.cells = finishCells(
      plan.cells.map((c) => (c.place === 'eat_out' ? { ...c, ...wrong } : c)),
      profileA,
      classesA,
    );
    expect(checkPlan(plan, profileA, classesA, rulesA).violations.filter((v) => v.rule === 'reason_criterion')).toEqual([]);
  });
});
