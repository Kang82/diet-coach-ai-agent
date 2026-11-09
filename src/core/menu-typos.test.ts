// T22-5: 외식 메뉴 오타 안내. "샌다위치"와 "샌드위치"는 다른 메뉴로 취급되니(menuKey 정확히 일치) 프로필 확인 화면에서 알린다
import { describe, expect, it } from 'vitest';
import { menuTypoHint, similarMenus } from './menu-typos.ts';
import type { MealSetting } from './types.ts';

const eatOut = (meal: MealSetting['meal'], menus: string[], dayType: MealSetting['dayType'] = 'weekday'): MealSetting => ({
  dayType,
  meal,
  place: 'eat_out',
  companions: 'alone',
  menus,
});

describe('similarMenus', () => {
  it('끼니가 달라도 한 글자만 다른 메뉴 쌍을 찾는다. 이름은 입력한 그대로(앞뒤 공백만 정리)', () => {
    const meals = [eatOut('lunch', ['샌드위치', '김밥']), eatOut('dinner', [' 샌다위치 ', '국밥'])];
    expect(similarMenus(meals)).toEqual([['샌드위치', '샌다위치']]);
  });

  it('같은 끼니 안에서도, 글자가 하나 더 있거나 빠진 것도 찾는다', () => {
    expect(similarMenus([eatOut('lunch', ['비빔밥', '비빔빕'])])).toEqual([['비빔밥', '비빔빕']]);
    expect(similarMenus([eatOut('lunch', ['돈까스정식', '돈까스정'])])).toEqual([['돈까스정식', '돈까스정']]);
  });

  it('공백만 다른 이름은 같은 메뉴라 빼고, 같은 이름이 여러 끼니에 있어도 빼며, 집밥 끼니는 보지 않는다', () => {
    const meals: MealSetting[] = [
      eatOut('lunch', ['쌀국수', '샌드위치']),
      eatOut('dinner', ['쌀 국수', '샌드위치']),
      { dayType: 'weekday', meal: 'breakfast', place: 'home', companions: 'alone', menus: ['쌀국슈'] },
    ];
    expect(similarMenus(meals)).toEqual([]);
  });

  it('두 글자 이하 메뉴(라면/냉면)와 두 글자 이상 다른 메뉴(김밥/참치김밥)는 뺀다', () => {
    expect(similarMenus([eatOut('lunch', ['라면', '냉면', '김밥', '참치김밥'])])).toEqual([]);
  });

  it('여러 쌍이면 앞 메뉴의 입력 순서대로, 쌍마다 한 번', () => {
    const meals = [eatOut('lunch', ['순두부찌개', '김치찌개', '비빔밥']), eatOut('dinner', ['비빔빕', '순두부찌게'], 'weekend')];
    expect(similarMenus(meals)).toEqual([
      ['순두부찌개', '순두부찌게'],
      ['비빔밥', '비빔빕'],
    ]);
  });
});

describe('menuTypoHint', () => {
  it('쌍이 없으면 없음, 있으면 쌍을 나열하고 하나로 고치라고 한다', () => {
    expect(menuTypoHint([])).toBeUndefined();
    expect(menuTypoHint([['샌드위치', '샌다위치']])).toBe(
      '비슷한 이름의 외식 메뉴가 있어요: 샌드위치 · 샌다위치. 같은 메뉴라면 하나로 고쳐 주세요. 이름이 다르면 다른 메뉴로 봐요.',
    );
    expect(menuTypoHint([['비빔밥', '비빔빕'], ['샌드위치', '샌다위치']])).toContain('비빔밥 · 비빔빕, 샌드위치 · 샌다위치.');
  });
});
