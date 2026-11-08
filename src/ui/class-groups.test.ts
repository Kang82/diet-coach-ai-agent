// B16 T12-2: 분류 확인 화면의 끼니 묶음과 해결 방법
import { describe, expect, it } from 'vitest';
import { classesF, classesG, profileF, profileG } from '../core/__fixtures__/personas.ts';
import type { Slot } from '../core/types.ts';
import { classGroupsView, withObject } from './class-groups.ts';

const tueLunch: Slot = { day: 'tue', meal: 'lunch' };

describe('classGroupsView', () => {
  it('페르소나 F(화요일 점심 일정): 두 끼니 모두 모자라고, 끼니마다 바꿀 메뉴와 메뉴 추가를 안내한다', () => {
    expect(classGroupsView(profileF, classesF, [tueLunch])).toEqual({
      groups: [
        {
          key: 'weekday-lunch',
          title: '평일 점심 · 4끼 · 쓸 수 있는 메뉴 2개(주 1회 1개)',
          short: true,
          menus: ['샐러드', '주먹밥'],
          fixes: [{ menu: '주먹밥', text: '주먹밥을 "자주 먹어도 됨"으로 바꾸기' }],
          addMenu: '평일 점심에 외식 메뉴 1개 더 넣기',
        },
        {
          key: 'weekday-dinner',
          title: '평일 저녁 · 5끼 · 쓸 수 있는 메뉴 3개(주 1회 1개)',
          short: true,
          menus: ['샐러드', '덮밥', '토스트'],
          fixes: [{ menu: '토스트', text: '토스트를 "자주 먹어도 됨"으로 바꾸기' }],
          addMenu: '평일 저녁에 외식 메뉴 1개 더 넣기',
        },
      ],
      others: [],
      summary: '평일 점심, 평일 저녁 외식 메뉴가 모자라요. 표시한 끼니에서 고칠 방법을 골라 주세요.',
    });
  });

  it('페르소나 F(일정 없음): 점심만 모자라고 분류를 바꿔서는 안 돼 메뉴 추가만', () => {
    const view = classGroupsView(profileF, classesF, []);
    expect(view.groups.map((g) => [g.short, g.fixes, g.addMenu])).toEqual([
      [true, [], '평일 점심에 외식 메뉴 1개 더 넣기'],
      [false, [], undefined],
    ]);
  });

  it('가능하면 해결 방법과 요약이 없다', () => {
    expect(classGroupsView(profileG, classesG, [])).toEqual({
      groups: [{ key: 'weekday-lunch', title: '평일 점심 · 5끼 · 쓸 수 있는 메뉴 2개', short: false, menus: ['비빔밥', '칼국수'], fixes: [] }],
      others: [],
    });
  });

  it('프로필이 없으면 묶지 않고, 프로필에 없는 분류 메뉴는 others', () => {
    expect(classGroupsView(undefined, classesG, [])).toEqual({ groups: [], others: ['비빔밥', '칼국수'] });
    const extra = [...classesG, { ...classesG[0]!, menu: '국밥' }];
    expect(classGroupsView(profileG, extra, []).others).toEqual(['국밥']);
  });
});

describe('withObject', () => {
  it.each([
    ['주먹밥', '주먹밥을'],
    ['토스트', '토스트를'],
    ['BLT', 'BLT을(를)'],
  ])('%s → %s', (word, expected) => expect(withObject(word)).toBe(expected));
});
