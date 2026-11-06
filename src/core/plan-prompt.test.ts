// 스펙 4.3, 4.4 프롬프트. 문장 전체가 아니라 LLM에 꼭 전해야 할 사실이 들어 있는지 확인한다.
import { describe, expect, it } from 'vitest';
import { classesA, planA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import { buildGeneratePrompt, buildRegeneratePrompt, normalizeMenuId } from './plan-prompt.ts';
import type { GeneratePlanInput, RegenerateCellsInput } from './plan-generator.ts';

function generateInput(patch: Partial<GeneratePlanInput> = {}): GeneratePlanInput {
  return {
    profile: structuredClone(profileA),
    rules: structuredClone(rulesA),
    classes: structuredClone(classesA),
    weekStart: '2026-11-09',
    events: [],
    ...patch,
  };
}

describe('buildGeneratePrompt', () => {
  it('채워야 할 끼니 수와 각 끼니를 알린다', () => {
    const prompt = buildGeneratePrompt(generateInput());

    expect(prompt).toContain('모두 14칸');
    expect(prompt).toContain('- 평일 점심 (mon, tue, wed, thu, fri의 lunch): 외식 (place: eat_out)');
    expect(prompt).toContain('- 평일 저녁 (mon, tue, wed, thu, fri의 dinner): 집밥 (place: home). 조리 20분 이내');
    expect(prompt).toContain('- 주말 점심 (sat, sun의 lunch): 집밥 (place: home). 조리 시간 제한 없음');
    expect(prompt).not.toContain('breakfast');
  });

  it('외식 메뉴 목록을 분류별로 알리고, 주 1회 이하 메뉴를 따로 적는다', () => {
    const prompt = buildGeneratePrompt(generateInput());

    // 같은 설정의 끼니는 한 줄로 묶여 메뉴 설명이 한 번만 나온다
    expect(prompt.match(/menuId는 다음 중 하나를/g)).toHaveLength(1);

    expect(prompt).toContain('menuId는 다음 중 하나를 글자 그대로: 백반, 쌀국수, 회덮밥');
    expect(prompt).toContain('1주일에 1번까지만: 국밥, 돈가스');
    expect(prompt).toContain('회덮밥(초장 절반)');
  });

  it('피하기로 분류된 메뉴는 목록에 넣지 않는다', () => {
    const classes = structuredClone(classesA);
    classes.find((c) => c.menu === '쌀국수')!.class = 'avoid';

    const prompt = buildGeneratePrompt(generateInput({ classes }));

    expect(prompt).toContain('글자 그대로: 백반, 회덮밥');
    expect(prompt).not.toMatch(/쌀국수/);
  });

  it('피할 음식, 태그 제한, 다양성 규칙, 식단 기준을 알린다', () => {
    const prompt = buildGeneratePrompt(generateInput());

    expect(prompt).toContain('피할 음식: 유제품(dairy)');
    expect(prompt).toContain('우유를 마시면 배가 아파요');
    expect(prompt).toContain('fried(튀김) 1번');
    expect(prompt).toContain('processed_meat(햄, 소시지 같은 가공육) 0번');
    expect(prompt).toContain('전날과 같은 메뉴는 넣지 않습니다');
    expect(prompt).toContain('같은 메뉴는 1주일에 2번까지만');
    expect(prompt).toContain('양과 열량 줄이기(reduce_portion_calories), 포화지방 줄이기(reduce_saturated_fat), 식이섬유 늘리기(increase_fiber)');
    expect(prompt).not.toContain('reduce_refined_carbs)');
  });

  it('고기를 피하면 펼친 고기 태그까지 알린다', () => {
    const profile = { ...structuredClone(profileA), avoid: ['meat' as const] };

    expect(buildGeneratePrompt(generateInput({ profile }))).toContain(
      '피할 음식: 고기(meat), 돼지고기(pork), 소고기(beef), 닭고기(chicken)',
    );
  });

  it('일정이 있는 끼니는 빼고, 칸을 만들지 말라고 알린다', () => {
    const prompt = buildGeneratePrompt(generateInput({ events: [{ day: 'tue', meal: 'dinner', note: '회식' }] }));

    expect(prompt).toContain('모두 13칸');
    expect(prompt).toContain('화요일 저녁 (tue dinner): 회식');
    expect(prompt).toContain('- 평일 저녁 (mon, wed, thu, fri의 dinner): 집밥');
  });
});

describe('buildRegeneratePrompt', () => {
  function regenerateInput(patch: Partial<RegenerateCellsInput> = {}): RegenerateCellsInput {
    return {
      plan: structuredClone(planA),
      targets: [{ day: 'tue', meal: 'lunch' }],
      violations: [
        {
          rule: 'avoid_tag',
          cells: [{ day: 'tue', meal: 'lunch' }],
          regenerate: [{ day: 'tue', meal: 'lunch' }],
          detail: 'dairy',
        },
      ],
      profile: structuredClone(profileA),
      rules: structuredClone(rulesA),
      classes: structuredClone(classesA),
      ...patch,
    };
  }

  it('다시 만들 칸, 위반 이유, 나머지 칸을 알린다', () => {
    const prompt = buildRegeneratePrompt(regenerateInput());

    expect(prompt).toContain('"다시 만들 칸" 1곳만');
    expect(prompt).toContain('- 피할 음식이 들어감 [dairy]: 화요일 점심 (tue lunch)');
    expect(prompt).toContain('- 월요일 점심 (mon lunch): 회덮밥 [fish]');
    // 다시 만들 칸은 "지금 식단표"에 넣지 않는다 (채워야 할 끼니 목록에만 나온다)
    expect(prompt).not.toContain('(tue lunch): 백반');
    expect(prompt).toContain('- 평일 점심 (tue의 lunch): 외식 (place: eat_out)');
    expect(prompt).not.toContain('평일 저녁');
  });

  it('사용자 요청이 있으면 알리고, 없으면 그 절을 넣지 않는다', () => {
    expect(buildRegeneratePrompt(regenerateInput({ userRequest: '면 말고 밥으로' }))).toContain(
      '## 사용자 요청\n면 말고 밥으로',
    );
    expect(buildRegeneratePrompt(regenerateInput())).not.toContain('## 사용자 요청');
  });

  it('위반이 없으면 위반 절을 넣지 않는다', () => {
    expect(buildRegeneratePrompt(regenerateInput({ violations: [] }))).not.toContain('지키지 못한 규칙');
  });
});

describe('normalizeMenuId', () => {
  it.each([
    ['  두부 채소 볶음  ', '두부 채소 볶음'],
    ['회덮밥 (초장 절반)', '회덮밥'],
    ['백반(생선 반찬)', '백반'],
    ['연어 덮밥 (마요네즈 없이) ', '연어 덮밥'],
    ['닭가슴살  샐러드', '닭가슴살 샐러드'],
    ['쌀국수（숙주 추가）', '쌀국수'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeMenuId(input)).toBe(expected);
  });

  it('메뉴 목록이 있으면 공백만 다른 이름을 목록의 글자로 맞춘다', () => {
    expect(normalizeMenuId('회 덮밥 (초장 절반)', ['회덮밥', '백반'])).toBe('회덮밥');
  });

  it('목록에 없는 메뉴는 정규화한 이름 그대로 둔다 (checkPlan이 eat_out_not_in_list로 거른다)', () => {
    expect(normalizeMenuId('짜장면', ['회덮밥', '백반'])).toBe('짜장면');
  });
});
