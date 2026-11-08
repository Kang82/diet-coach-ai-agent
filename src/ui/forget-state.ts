// "내 기록 모두 지우기" 링크의 상태와 문구 (tasks.md T15, 스펙 5장). 화면 아래에 늘 보인다.
// 브라우저 확인창(confirm)은 쓰지 않고 그 자리에서 한 번 더 묻는다.
import type { DeleteResult } from './saved-profile.ts';

export type ForgetState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'deleting' }
  | { kind: 'done' }
  /** 일부 대화를 못 지웠다. 그 대화는 서버 기록에 남아 다시 누르면 다시 지운다 */
  | { kind: 'partial'; failed: number }
  | { kind: 'error' };

export const FORGET_TEXT = {
  link: '내 기록 모두 지우기',
  explain:
    '이 링크로 남긴 대화(인터뷰 답, 메뉴 분류, 식단표)와 저장한 프로필을 모두 지워요. 지금 화면도 처음부터 다시 시작해요. 되돌릴 수 없어요.',
  confirm: '모두 지우기',
  cancel: '취소',
  deleting: '지우는 중이에요…',
  done: '모두 지웠어요.',
  partial: (failed: number) => `대화 ${failed}개를 지우지 못했어요. 잠시 뒤 다시 눌러 주세요.`,
  error: '지우지 못했어요. 잠시 뒤 다시 시도해 주세요.',
} as const;

export function forgetResultState(result: DeleteResult): ForgetState {
  if (!result.ok) return { kind: 'error' };
  return result.failed > 0 ? { kind: 'partial', failed: result.failed } : { kind: 'done' };
}

/** 화면에 보일 것: 안내 문구, 링크(처음 또는 다시 시도), 지우기·취소 버튼 */
export function forgetView(state: ForgetState): { message?: string; link?: true; confirm?: true } {
  switch (state.kind) {
    case 'idle':
      return { link: true };
    case 'confirming':
      return { message: FORGET_TEXT.explain, confirm: true };
    case 'deleting':
      return { message: FORGET_TEXT.deleting };
    case 'done':
      return { message: FORGET_TEXT.done, link: true };
    case 'partial':
      return { message: FORGET_TEXT.partial(state.failed), link: true };
    case 'error':
      return { message: FORGET_TEXT.error, link: true };
  }
}
