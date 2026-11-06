// 저장한 프로필 읽기 (tasks.md B6 T5-5)
import { describe, expect, it } from 'vitest';
import { profileA } from '../core/__fixtures__/persona-a.ts';
import { memoryStore } from './__fixtures__/memory-store.ts';
import { loadSavedProfile, parseSavedProfile, rememberResult, SAVED_PROFILE_KEY } from './saved-profile.ts';

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

describe('rememberResult', () => {
  it('동의한 결과는 저장하고 다시 읽을 수 있다', () => {
    const store = memoryStore();
    rememberResult(result, store);
    expect(loadSavedProfile(store)).toEqual({ result });
  });

  it('동의하지 않은 결과면 전에 저장한 프로필을 지운다', () => {
    const store = memoryStore({ [SAVED_PROFILE_KEY]: JSON.stringify({ result }) });
    const { consentedAt: _, ...declined } = result;
    rememberResult(declined, store);
    expect(store.dump()).toEqual({});
  });
});
