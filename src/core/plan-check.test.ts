import { describe, expect, it } from 'vitest';
import { compareSlots, parseCheckBody } from './plan-check.ts';

describe('parseCheckBody (T25)', () => {
  it('맞는 값이면 칸과 eaten', () => {
    expect(parseCheckBody('{"day":"mon","meal":"lunch","eaten":true}')).toEqual({ day: 'mon', meal: 'lunch', eaten: true });
    expect(parseCheckBody('{"day":"sun","meal":"breakfast","eaten":false,"x":1}')).toEqual({
      day: 'sun',
      meal: 'breakfast',
      eaten: false,
    });
  });

  it('모르는 요일·끼니, eaten이 boolean이 아니거나, JSON이 아니면 null', () => {
    expect(parseCheckBody('{"day":"monday","meal":"lunch","eaten":true}')).toBeNull();
    expect(parseCheckBody('{"day":"mon","meal":"snack","eaten":true}')).toBeNull();
    expect(parseCheckBody('{"day":"mon","meal":"lunch","eaten":"true"}')).toBeNull();
    expect(parseCheckBody('{"day":"mon","meal":"lunch"}')).toBeNull();
    expect(parseCheckBody('null')).toBeNull();
    expect(parseCheckBody('x')).toBeNull();
  });
});

it('compareSlots는 요일 → 끼니 순서', () => {
  const slots = [
    { day: 'tue', meal: 'breakfast' },
    { day: 'mon', meal: 'dinner' },
    { day: 'mon', meal: 'breakfast' },
  ] as const;
  expect([...slots].sort(compareSlots)).toEqual([
    { day: 'mon', meal: 'breakfast' },
    { day: 'mon', meal: 'dinner' },
    { day: 'tue', meal: 'breakfast' },
  ]);
});
