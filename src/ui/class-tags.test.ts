// T13-4: 분류 확인 화면의 메뉴별 태그 한 줄 (읽기 전용)
import { describe, expect, it } from 'vitest';
import { AVOID_TAG_REASON_PREFIX, AVOID_TAG_REASON_SUFFIX, USER_CHOSEN_REASON } from '../core/menu-classification.ts';
import type { MenuClassification } from '../core/types.ts';
import { avoidTagNote, tagLine } from './class-tags.ts';

const c = (patch: Partial<MenuClassification>): MenuClassification => ({
  menu: '샌드위치',
  class: 'often',
  reason: '채소',
  criterionIds: [],
  orderTips: [],
  ...patch,
});

describe('tagLine', () => {
  it('재료와 음식 종류를 화면 라벨로 나눠 보인다', () => {
    expect(tagLine(c({ tags: ['wheat', 'meat', 'chicken', 'refined_carb_main'] }))).toBe(
      '들어가는 것: 밀, 고기, 닭고기 · 흰 면·흰 빵이 주식인 메뉴',
    );
    expect(tagLine(c({ tags: ['egg'] }))).toBe('들어가는 것: 달걀');
    expect(tagLine(c({ tags: ['fried'] }))).toBe('튀김');
  });

  it('태그가 없거나 예전 분류(tags 없음)면 숨긴다', () => {
    expect(tagLine(c({ tags: [] }))).toBeUndefined();
    expect(tagLine(c({}))).toBeUndefined();
  });
});

describe('avoidTagNote', () => {
  const promoted = c({ class: 'avoid', reason: `${AVOID_TAG_REASON_PREFIX}생선${AVOID_TAG_REASON_SUFFIX}`, tags: ['fish'] });

  it('피할 음식 때문에 피하기가 된 메뉴를 다른 분류로 고르면, 그 재료 없이 주문한다고 본다고 알린다', () => {
    expect(avoidTagNote(promoted, 'often')).toBe('생선 없이 주문한다고 보고 식단을 짜요.');
    expect(avoidTagNote(promoted, 'weekly_max_1')).toBe('생선 없이 주문한다고 보고 식단을 짜요.');
  });

  it('피하기 그대로이거나 다른 이유의 분류면 없음', () => {
    expect(avoidTagNote(promoted, 'avoid')).toBeUndefined();
    expect(avoidTagNote(c({ class: 'avoid', reason: '튀김', tags: ['fried'] }), 'often')).toBeUndefined();
    expect(avoidTagNote(c({ reason: USER_CHOSEN_REASON }), 'often')).toBeUndefined();
  });
});
