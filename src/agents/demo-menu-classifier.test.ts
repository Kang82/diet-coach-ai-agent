// 개발용 가짜 메뉴 분류기 (tasks.md B5)
import { describe, expect, it } from 'vitest';
import { classesA } from '../core/__fixtures__/persona-a.ts';
import { rulesA } from '../core/__fixtures__/rules-a.ts';
import { createDemoMenuClassifier } from './demo-menu-classifier.ts';

describe('createDemoMenuClassifier', () => {
  it('페르소나 A 메뉴는 classesA, 모르는 메뉴는 often', async () => {
    const res = await createDemoMenuClassifier({ delayMs: 0 }).classify({ menus: ['돈가스', '라면'], rules: rulesA, avoid: [] });
    expect(res.value).toEqual([
      classesA.find((c) => c.menu === '돈가스'),
      { menu: '라면', class: 'often', reason: '가짜 분류 (개발용)', criterionIds: [], orderTips: [] },
    ]);
    expect(res.usage.input).toBe(0);
  });
});
