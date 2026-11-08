// "내 기록 모두 지우기" 링크의 상태와 문구 (tasks.md T15)
import { describe, expect, it } from 'vitest';
import { FORGET_TEXT, forgetResultState, forgetView } from './forget-state.ts';

describe('forgetResultState', () => {
  it('다 지웠으면 done, 일부 못 지웠으면 partial, 요청이 실패하면 error', () => {
    expect(forgetResultState({ ok: true, failed: 0 })).toEqual({ kind: 'done' });
    expect(forgetResultState({ ok: true, failed: 2 })).toEqual({ kind: 'partial', failed: 2 });
    expect(forgetResultState({ ok: false })).toEqual({ kind: 'error' });
  });
});

describe('forgetView', () => {
  it('처음에는 링크만, 누르면 설명과 지우기·취소', () => {
    expect(forgetView({ kind: 'idle' })).toEqual({ link: true });
    expect(forgetView({ kind: 'confirming' })).toEqual({ message: FORGET_TEXT.explain, confirm: true });
  });

  it('지우는 중에는 버튼 없이 안내만', () => {
    expect(forgetView({ kind: 'deleting' })).toEqual({ message: FORGET_TEXT.deleting });
  });

  it('끝나면 결과 안내와 링크를 다시 보인다 (새 대화를 이어 쓰다 다시 지울 수 있게, 못 지웠으면 다시 시도)', () => {
    expect(forgetView({ kind: 'done' })).toEqual({ message: FORGET_TEXT.done, link: true });
    expect(forgetView({ kind: 'partial', failed: 2 })).toEqual({ message: FORGET_TEXT.partial(2), link: true });
    expect(forgetView({ kind: 'error' })).toEqual({ message: FORGET_TEXT.error, link: true });
  });

  it('설명은 무엇을 지우는지와 되돌릴 수 없음을 말한다', () => {
    expect(FORGET_TEXT.explain).toContain('인터뷰 답');
    expect(FORGET_TEXT.explain).toContain('되돌릴 수 없어요');
    expect(FORGET_TEXT.partial(2)).toContain('2개');
  });
});
