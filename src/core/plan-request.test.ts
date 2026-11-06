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
} from './plan-request.ts';

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
