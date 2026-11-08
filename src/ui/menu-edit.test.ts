// B16 T12-3: "외식 메뉴 고치기"로 새 대화에 넣어 두는 값
import { describe, expect, it } from 'vitest';
import { classesF, profileF } from '../core/__fixtures__/personas.ts';
import type { InterviewResult } from '../core/interview.ts';
import { memoryStore } from './__fixtures__/memory-store.ts';
import { clearAll, clearDrafts, draftKey } from './browser-store.ts';
import { progressFromResult } from './interview-form-state.ts';
import { loadCarryClasses, prepareMenuEdit } from './menu-edit.ts';

const { goals, goalNote, medication, avoid, avoidNote, meals } = profileF;
const result: InterviewResult = { goals, goalNote, medication, avoid, avoidNote, meals };
const events = [{ day: 'tue' as const, meal: 'lunch' as const, note: '팀 점심' }];

describe('prepareMenuEdit', () => {
  it('새 대화에 프로필 확인 화면부터의 인터뷰 진행, 일정, 이전 분류를 넣는다', () => {
    const store = memoryStore();
    prepareMenuEdit(store, 'c2', { result, events, classes: classesF });
    expect(JSON.parse(store.getItem(draftKey('interview', 'c2'))!)).toEqual(JSON.parse(JSON.stringify(progressFromResult(result))));
    expect(JSON.parse(store.getItem(draftKey('period', 'c2'))!)).toEqual(events);
    expect(loadCarryClasses(store, 'c2')).toEqual(classesF);
  });

  it('저장에 동의했던 사람은 동의를 켠 채로, 아니면 끈 채로', () => {
    const consented = { ...result, consentedAt: '2026-11-08T00:00:00Z' };
    expect(prepareMenuEdit(memoryStore(), 'c2', { result: consented, events, classes: [] })).toBe('edit_saved');
    expect(prepareMenuEdit(memoryStore(), 'c2', { result, events, classes: [] })).toBe('fresh');
  });

  it('저장소가 없어도 에러 없이 끝난다', () => {
    expect(prepareMenuEdit(undefined, 'c2', { result, events, classes: [] })).toBe('fresh');
  });
});

describe('loadCarryClasses', () => {
  it('없거나 깨졌으면 빈 배열', () => {
    expect(loadCarryClasses(memoryStore(), 'c1')).toEqual([]);
    expect(loadCarryClasses(memoryStore({ [draftKey('carryClasses', 'c1')]: '{broken' }), 'c1')).toEqual([]);
  });

  it('대화별로 지우고, 내 정보 지우기에 포함된다', () => {
    const store = memoryStore({ [draftKey('carryClasses', 'c1')]: '[]' });
    clearDrafts('c1', ['carryClasses'], store);
    expect(store.dump()).toEqual({});
    const store2 = memoryStore({ [draftKey('carryClasses', 'c1')]: '[]' });
    clearAll(store2);
    expect(store2.dump()).toEqual({});
  });
});
