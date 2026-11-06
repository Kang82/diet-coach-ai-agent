// 저장한 프로필 읽기 (tasks.md B6 T5-5)
import { describe, expect, it } from 'vitest';
import { profileA } from '../core/__fixtures__/persona-a.ts';
import { parseSavedProfile } from './saved-profile.ts';

const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
const result = { goals, goalNote, medication, avoid, avoidNote, meals, consentedAt: '2026-11-06T01:00:00.000Z' };

describe('parseSavedProfile', () => {
  it('저장한 값을 그대로 읽는다', () => {
    expect(parseSavedProfile(JSON.stringify({ result }))).toEqual({ result });
  });

  it.each([
    ['없음', null],
    ['깨진 JSON', '{깨진'],
    ['result 없음', '{}'],
    ['동의 시각 없음', JSON.stringify({ result: { ...result, consentedAt: undefined } })],
    ['동의 시각이 빈 문자열', JSON.stringify({ result: { ...result, consentedAt: '' } })],
    ['끼니가 모자람', JSON.stringify({ result: { ...result, meals: meals.slice(1) } })],
    ['목표 없음', JSON.stringify({ result: { ...result, goals: [] } })],
  ])('%s이면 undefined', (_, raw) => {
    expect(parseSavedProfile(raw)).toBeUndefined();
  });
});
