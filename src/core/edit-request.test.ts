// 칸 다시 추천 메시지 (tasks.md B2). 화면이 만들고 edit_plan_cells 도구가 해석한다. 모델은 내용을 옮겨 적지 않는다.
import { describe, expect, it } from 'vitest';
import { DEFAULT_EDIT_REQUEST, formatEditRequest, isEditRequest, parseEditRequest } from './edit-request.ts';

describe('formatEditRequest / parseEditRequest', () => {
  it('사람이 읽을 수 있는 형식으로 만들고 그대로 되읽는다', () => {
    const body = formatEditRequest({ target: { day: 'tue', meal: 'lunch' }, request: '생선 말고' });

    expect(body).toBe('칸 다시 추천: 화요일 점심\n원하는 점: 생선 말고');
    expect(parseEditRequest(body)).toEqual({ target: { day: 'tue', meal: 'lunch' }, request: '생선 말고' });
  });

  it('원하는 점이 비면 기본 문구를 넣는다', () => {
    const body = formatEditRequest({ target: { day: 'sun', meal: 'dinner' }, request: '   ' });

    expect(parseEditRequest(body)).toEqual({ target: { day: 'sun', meal: 'dinner' }, request: DEFAULT_EDIT_REQUEST });
  });

  it('원하는 점의 줄바꿈은 한 줄로 합친다', () => {
    const body = formatEditRequest({ target: { day: 'mon', meal: 'dinner' }, request: '국물 말고\n볶음으로' });

    expect(parseEditRequest(body)?.request).toBe('국물 말고 볶음으로');
  });

  it('앞뒤 공백과 CRLF를 허용한다', () => {
    expect(parseEditRequest('  칸 다시 추천:  수요일   저녁 \r\n원하는 점:  가볍게  ')).toEqual({
      target: { day: 'wed', meal: 'dinner' },
      request: '가볍게',
    });
  });

  it('원하는 점 줄이 없으면 기본 문구', () => {
    expect(parseEditRequest('칸 다시 추천: 금요일 아침')?.request).toBe(DEFAULT_EDIT_REQUEST);
  });

  it.each([
    ['다른 메시지', '식단표 만들어 줘'],
    ['모르는 요일', '칸 다시 추천: 팔요일 점심'],
    ['모르는 끼니', '칸 다시 추천: 화요일 야식'],
    ['칸이 빠짐', '칸 다시 추천: '],
  ])('형식이 틀리면 undefined: %s', (_, body) => {
    expect(parseEditRequest(body)).toBeUndefined();
  });

  it('isEditRequest는 머리말만 본다', () => {
    expect(isEditRequest('칸 다시 추천: 팔요일')).toBe(true);
    expect(isEditRequest('식단표 만들어 줘')).toBe(false);
  });
});
