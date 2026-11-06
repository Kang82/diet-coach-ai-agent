// 개발용 가짜 메뉴 분류기 (tasks.md B5). `.dev.vars`에 MENU_CLASSIFIER=demo를 넣으면 classify_menus가 이것을 쓴다.
// 페르소나 A 분류(classesA)에서 같은 메뉴를 찾아 쓰고, 없는 메뉴는 often으로 잠시 뒤 돌려준다.
// 가짜 식단 생성(PLAN_GENERATOR=demo)과 따로 켜고 끈다.
import { classesA } from '../core/__fixtures__/persona-a.ts';
import type { MenuClassifier } from '../core/menu-classifier.ts';
import type { TokenUsage } from '../core/plan-generator.ts';
import { MODEL_CANDIDATES } from './models.ts';

const NO_USAGE: TokenUsage = { model: MODEL_CANDIDATES.llamaScout, input: 0, output: 0 };

export function createDemoMenuClassifier({ delayMs = 2_000 }: { delayMs?: number } = {}): MenuClassifier {
  return {
    async classify({ menus }) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const value = menus.map(
        (menu) =>
          structuredClone(classesA.find((c) => c.menu === menu)) ?? {
            menu,
            class: 'often' as const,
            reason: '가짜 분류 (개발용)',
            criterionIds: [],
            orderTips: [],
          },
      );
      return { value, usage: NO_USAGE };
    },
  };
}
