// 저장한 프로필 읽기 (tasks.md B6 T5-5)
import { describe, expect, it } from 'vitest';
import { profileA } from '../core/__fixtures__/persona-a.ts';
import { memoryStore } from './__fixtures__/memory-store.ts';
import { PROFILE_KEY } from './browser-store.ts';
import { clearLegacyProfile, deleteSavedProfile, fetchSavedProfile, parseSavedProfile } from './saved-profile.ts';

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

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { input: string; init?: RequestInit }[] = [];
  const fn = async (input: string, init?: RequestInit) => {
    calls.push({ input, init });
    return respond();
  };
  return { fn, calls };
}

describe('fetchSavedProfile', () => {
  it('토큰을 붙여 불러오고 검증한다', async () => {
    const { fn, calls } = fakeFetch(() => new Response(JSON.stringify({ result })));
    expect(await fetchSavedProfile('tok', fn)).toEqual({ result });
    expect(calls[0]).toEqual({ input: '/api/profile', init: { headers: { authorization: 'Bearer tok' } } });
  });

  it('없으면(null), 실패하면, 연결이 안 되면 undefined', async () => {
    expect(await fetchSavedProfile('tok', fakeFetch(() => new Response('null')).fn)).toBeUndefined();
    expect(await fetchSavedProfile('tok', fakeFetch(() => new Response('', { status: 401 })).fn)).toBeUndefined();
    const offline = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await fetchSavedProfile('tok', offline.fn)).toBeUndefined();
  });
});

describe('deleteSavedProfile', () => {
  it('DELETE를 보내고 성공 여부를 돌려준다', async () => {
    const ok = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await deleteSavedProfile('tok', ok.fn)).toBe(true);
    expect(ok.calls[0]?.init?.method).toBe('DELETE');
    expect(await deleteSavedProfile('tok', fakeFetch(() => new Response('', { status: 500 })).fn)).toBe(false);
  });
});

describe('clearLegacyProfile', () => {
  it('B8까지 쓰던 이 브라우저의 프로필만 지운다', () => {
    const store = memoryStore({ [PROFILE_KEY]: JSON.stringify({ result }), other: 'x' });
    clearLegacyProfile(store);
    expect(store.dump()).toEqual({ other: 'x' });
  });
});
