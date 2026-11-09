// 메뉴 분류 출력 스키마 (스펙 4.2, tasks.md B5)
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { menuClassesSchema, toMenuClassifications } from './menu-schema.ts';

const item = (menu: string) => ({ menu, class: 'often', reason: '이유', criterionIds: ['increase_fiber'], orderTips: [] });

describe('menuClassesSchema', () => {
  const schema = menuClassesSchema(['국밥', '백반']);

  it('대상과 1:1이면 통과', () => {
    expect(v.safeParse(schema, { classes: [item('백반'), item('국밥')] }).success).toBe(true);
  });

  it('빠지거나 추가되면 실패하고, 메시지에 무엇이 틀렸는지 적는다', () => {
    const res = v.safeParse(schema, { classes: [item('국밥'), item('라면')] });
    expect(res.success).toBe(false);
    expect(res.issues?.[0]?.message).toContain('빠진 메뉴: "백반"');
    expect(res.issues?.[0]?.message).toContain('목록에 없는 메뉴: "라면"');
  });

  it('모르는 분류 값은 실패', () => {
    expect(v.safeParse(schema, { classes: [item('국밥'), { ...item('백반'), class: 'sometimes' }] }).success).toBe(false);
  });

  it('값 하나를 문자열로 내도 배열로 받는다 (B6 gemma)', () => {
    const res = v.parse(schema, {
      classes: [item('국밥'), { ...item('백반'), criterionIds: 'increase_fiber', orderTips: '채소 반찬 위주로' }],
    });
    expect(toMenuClassifications(res)[1]).toMatchObject({ criterionIds: ['increase_fiber'], orderTips: ['채소 반찬 위주로'] });
  });

  it('메뉴 이름 앞뒤 공백은 떼고 1:1을 본다 (T9-3)', () => {
    const res = v.safeParse(schema, { classes: [item(' 국밥 '), item('백반\n')] });
    expect(res.success).toBe(true);
    expect(toMenuClassifications(res.output as never).map((c) => c.menu)).toEqual(['국밥', '백반']);
  });

  it('reason이 null이거나 없으면 빈 문자열로 받는다 (T9-3)', () => {
    const { reason: _omit, ...noReason } = item('백반');
    const res = v.parse(schema, { classes: [{ ...item('국밥'), reason: null }, noReason] });
    expect(toMenuClassifications(res).map((c) => c.reason)).toEqual(['', '']);
  });

  it('tags는 배열·문자열 하나를 받고, null은 빈 배열, 빼면 없음 그대로, 모르는 태그는 실패 (T13-4)', () => {
    const res = v.parse(schema, {
      classes: [{ ...item('국밥'), tags: ['pork', 'meat'] }, { ...item('백반'), tags: 'egg' }],
    });
    expect(toMenuClassifications(res).map((c) => c.tags)).toEqual([['meat', 'pork'], ['egg']]);
    const none = toMenuClassifications(v.parse(schema, { classes: [{ ...item('국밥'), tags: null }, item('백반')] }));
    expect(none[0]!.tags).toEqual([]);
    expect(none[1]).not.toHaveProperty('tags');
    expect(v.safeParse(schema, { classes: [{ ...item('국밥'), tags: ['noodle'] }, item('백반')] }).success).toBe(false);
  });

  it('기준 ID와 태그를 쉼표로 이은 문자열 하나로 내도 나눠 받는다 (B23 gemma 실제 실행)', () => {
    const res = v.parse(schema, {
      classes: [
        { ...item('국밥'), criterionIds: 'increase_fiber,reduce_portion_calories', tags: 'meat, pork' },
        { ...item('백반'), criterionIds: 'increase_fiber', tags: '' },
      ],
    });
    const out = toMenuClassifications(res);
    expect(out.map((c) => c.criterionIds)).toEqual([['increase_fiber', 'reduce_portion_calories'], ['increase_fiber']]);
    expect(out.map((c) => c.tags)).toEqual([['meat', 'pork'], []]);
    expect(v.safeParse(schema, { classes: [{ ...item('국밥'), criterionIds: 'increase_fiber,xyz' }, item('백반')] }).success).toBe(false);
  });

  it('null 배열을 받아 빈 배열로 바꾼다', () => {
    const res = v.parse(schema, {
      classes: [item('국밥'), { ...item('백반'), criterionIds: null, orderTips: null }],
    });
    expect(toMenuClassifications(res)[1]).toEqual({
      menu: '백반',
      class: 'often',
      reason: '이유',
      criterionIds: [],
      orderTips: [],
    });
  });
});
