// 첫 화면 분기와 동의 기본값 (tasks.md B6, 리뷰 5번)
import { describe, expect, it } from 'vitest';
import { defaultConsentFor, shouldOfferSaved, type StartChoiceInput } from './start-choice-state.ts';

const base: StartChoiceInput = { hasSaved: true, decided: false, interview: { kind: 'form' }, hasProgress: false };

describe('shouldOfferSaved', () => {
  it('저장한 프로필이 있고 새 대화면 고르게 한다', () => {
    expect(shouldOfferSaved(base)).toBe(true);
  });

  it.each([
    ['저장한 프로필 없음', { hasSaved: false }],
    ['이미 고름', { decided: true }],
    ['인터뷰 진행 중', { hasProgress: true }],
    ['서버가 목표를 다시 물음', { interview: { kind: 'form', serverAsk: { id: 't1' } } }],
    ['제출 실패 안내', { interview: { kind: 'form', alert: '실패' } }],
    ['제출 중', { interview: { kind: 'submitting' } }],
  ] as const)('%s이면 고르지 않는다', (_, patch) => {
    expect(shouldOfferSaved({ ...base, ...(patch as Partial<StartChoiceInput>) })).toBe(false);
  });
});

describe('defaultConsentFor', () => {
  it('바뀐 항목 고치기만 미리 체크', () => {
    expect(defaultConsentFor('edit_saved')).toBe(true);
    expect(defaultConsentFor('fresh')).toBe(false);
    expect(defaultConsentFor('use_saved')).toBe(false);
    expect(defaultConsentFor(undefined)).toBe(false);
  });
});
