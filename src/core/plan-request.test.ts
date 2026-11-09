// 메뉴 분류 요청과 식단표 만들기 메시지 (tasks.md B5, B6). 화면이 만들고 도구가 해석한다.
import { describe, expect, it } from 'vitest';
import {
  CLASSIFY_REQUEST,
  formatClassifyRequest,
  formatPlanRequest,
  isClassifyRequest,
  isPlanRequest,
  parseClassifyRequest,
  parsePlanRequest,
  resolvePlanClasses,
} from './plan-request.ts';
import { classesA, profileA } from './__fixtures__/persona-a.ts';
import { classesForPlan } from './menu-classification.ts';

describe('formatPlanRequest / parsePlanRequest', () => {
  it('바꾼 분류를 그대로 되읽는다', () => {
    const body = formatPlanRequest({ overrides: [{ menu: '돈가스', class: 'avoid' }] });
    expect(body.startsWith('식단표 만들기:\n')).toBe(true);
    expect(isPlanRequest(body)).toBe(true);
    expect(parsePlanRequest(body)).toEqual({ overrides: [{ menu: '돈가스', class: 'avoid' }] });
  });

  it('바꾼 것이 없어도 된다', () => {
    expect(parsePlanRequest(formatPlanRequest({ overrides: [] }))).toEqual({ overrides: [] });
  });

  it('형식이 틀리면 undefined', () => {
    expect(parsePlanRequest('식단표 만들어 줘')).toBeUndefined();
    expect(parsePlanRequest('식단표 만들기:\n{깨진')).toBeUndefined();
    expect(parsePlanRequest('식단표 만들기:\nnull')).toBeUndefined();
    expect(parsePlanRequest('식단표 만들기:\n{"overrides":[{"menu":"국밥","class":"sometimes"}]}')).toBeUndefined();
    expect(parsePlanRequest('식단표 만들기:\n{"overrides":[{"class":"often"}]}')).toBeUndefined();
  });
});

describe('isClassifyRequest', () => {
  it('정해진 문구나 그 뒤에 JSON', () => {
    expect(isClassifyRequest(CLASSIFY_REQUEST)).toBe(true);
    expect(isClassifyRequest(` ${CLASSIFY_REQUEST}\n`)).toBe(true);
    expect(isClassifyRequest(formatClassifyRequest({ events: [] }))).toBe(true);
    expect(isClassifyRequest('메뉴 분류 요청:\n{깨진')).toBe(true);
    expect(isClassifyRequest('메뉴 분류 요청 해 줘')).toBe(false);
  });
});

describe('formatClassifyRequest / parseClassifyRequest', () => {
  it('일정을 그대로 되읽는다', () => {
    const events = [{ day: 'wed' as const, meal: 'dinner' as const, note: '팀 회식' }];
    const body = formatClassifyRequest({ events });
    expect(body.startsWith('메뉴 분류 요청:\n')).toBe(true);
    expect(parseClassifyRequest(body)).toEqual({ events });
  });

  it('옛 형식은 일정 없음', () => {
    expect(parseClassifyRequest(CLASSIFY_REQUEST)).toEqual({ events: [] });
  });

  it('형식이 틀리면 undefined', () => {
    expect(parseClassifyRequest('메뉴 분류 요청:\n{깨진')).toBeUndefined();
    expect(parseClassifyRequest('메뉴 분류 요청:\n{"events":[{"day":"xyz","meal":"lunch","note":""}]}')).toBeUndefined();
    expect(parseClassifyRequest('메뉴 분류 요청:\n{"events":[{"day":"mon","meal":"lunch"}]}')).toBeUndefined();
    expect(parseClassifyRequest('안녕')).toBeUndefined();
  });
});

// tasks.md T9-1: 깨진 만들기 메시지는 바꾼 분류를 조용히 버리지 않고 bad_request
describe('resolvePlanClasses', () => {
  it('정해진 형식이면 바꾼 분류를 반영한다', () => {
    const body = formatPlanRequest({ overrides: [{ menu: '국밥', class: 'avoid' }] });
    const out = resolvePlanClasses(body, profileA.meals, classesA);
    expect(out).toEqual({ kind: 'ok', classes: classesForPlan(profileA.meals, classesA, [{ menu: '국밥', class: 'avoid' }]) });
  });

  it('"식단표 만들기:"로 시작하는데 JSON이 깨지면 bad_request', () => {
    expect(resolvePlanClasses('식단표 만들기:\n{"overrides":[', profileA.meals, classesA)).toEqual({ kind: 'bad_request' });
    expect(resolvePlanClasses('식단표 만들기:\n{"overrides":[{"menu":"국밥","class":"x"}]}', profileA.meals, classesA)).toEqual({
      kind: 'bad_request',
    });
  });

  it('형식 밖 메시지나 사용자 메시지가 아니면 바꾼 분류 없이 저장된 분류를 쓴다', () => {
    const plain = { kind: 'ok', classes: classesForPlan(profileA.meals, classesA) };
    expect(resolvePlanClasses('식단표 만들어 줘', profileA.meals, classesA)).toEqual(plain);
    expect(resolvePlanClasses(undefined, profileA.meals, classesA)).toEqual(plain);
  });

  it('인터뷰나 저장된 분류가 없으면 no_classes', () => {
    const body = formatPlanRequest({ overrides: [] });
    expect(resolvePlanClasses(body, undefined, classesA)).toEqual({ kind: 'no_classes' });
    expect(resolvePlanClasses(body, profileA.meals, undefined)).toEqual({ kind: 'no_classes' });
  });
});

// B16 T12-4: "외식 메뉴 고치기" 뒤 다시 분류할 때 이전 분류를 싣는다
describe('분류 요청의 이전 분류(known)', () => {
  const known = [
    { menu: '국밥', class: 'weekly_max_1' as const, reason: '나트륨이 많음', criterionIds: ['reduce_portion_calories' as const], orderTips: ['국물 남기기'] },
  ];

  it('일정과 함께 되읽고, 없으면 옛 모양(events만)', () => {
    expect(parseClassifyRequest(formatClassifyRequest({ events: [], known }))).toEqual({ events: [], known });
    expect(formatClassifyRequest({ events: [], known: [] })).toBe(formatClassifyRequest({ events: [] }));
  });

  it('태그도 함께 되읽는다. 모르는 태그는 버리고, 태그가 없는 예전 값은 없음 그대로 (T13-4)', () => {
    const tagged = [{ ...known[0]!, tags: ['meat' as const, 'pork' as const] }];
    expect(parseClassifyRequest(formatClassifyRequest({ events: [], known: tagged }))).toEqual({ events: [], known: tagged });
    const body = `메뉴 분류 요청:
${JSON.stringify({ events: [], known: [{ ...known[0], tags: ['pork', 'noodle'] }] })}`;
    expect(parseClassifyRequest(body)?.known?.[0]?.tags).toEqual(['pork']);
    expect(parseClassifyRequest(formatClassifyRequest({ events: [], known }))?.known?.[0]).not.toHaveProperty('tags');
  });

  it('모르는 기준 ID는 버린다', () => {
    const body = `메뉴 분류 요청:\n${JSON.stringify({ events: [], known: [{ ...known[0], criterionIds: ['reduce_portion_calories', 'xyz'] }] })}`;
    expect(parseClassifyRequest(body)?.known?.[0]?.criterionIds).toEqual(['reduce_portion_calories']);
  });

  it.each([
    ['분류 값', { class: 'sometimes' }],
    ['빈 메뉴', { menu: ' ' }],
    ['긴 이유', { reason: 'ㄱ'.repeat(301) }],
    ['팁 6개', { orderTips: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    ['기준 ID가 문자열이 아님', { criterionIds: [1] }],
    ['태그가 배열이 아님', { tags: 'pork' }],
    ['태그 21개', { tags: Array.from({ length: 21 }, () => 'pork') }],
  ])('형식이 틀리면(%s) 요청 전체가 undefined', (_, patch) => {
    const body = `메뉴 분류 요청:\n${JSON.stringify({ events: [], known: [{ ...known[0], ...patch }] })}`;
    expect(parseClassifyRequest(body)).toBeUndefined();
  });

  it('101개 이상이면 undefined', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...known[0], menu: `메뉴${i}` }));
    expect(parseClassifyRequest(`메뉴 분류 요청:\n${JSON.stringify({ events: [], known: many })}`)).toBeUndefined();
  });
});
