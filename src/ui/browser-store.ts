// 이 브라우저(localStorage)에 두는 값의 키와 지우기 (B5·B6 리뷰 4번).
// 대화별 진행 값(인터뷰 답, 일정, 고르던 분류)에는 건강 정보가 들어 있어, 그 단계가 끝나면 지운다.
// "이 브라우저에 저장한 내 정보 지우기"는 대화 ID를 뺀 diet-coach:* 키를 모두 지운다.
// 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 아무것도 하지 않는다.

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const PREFIX = 'diet-coach:';
export const CONVERSATION_KEY = `${PREFIX}conversation`;
export const PROFILE_KEY = `${PREFIX}profile`;
/** 사용자 링크 토큰 (auth-token.ts). 내 정보 지우기에서도 남긴다: 지우면 받은 링크를 다시 열어야 한다 */
export const TOKEN_KEY = `${PREFIX}token`;

/** carryClasses: "외식 메뉴 고치기"로 새 대화에 넘기는 이전 분류 (B16 T12-3). 분류가 끝나면 지운다 */
export type DraftKind = 'interview' | 'period' | 'menuClasses' | 'carryClasses';

const DRAFT_PREFIX: Record<DraftKind, string> = {
  interview: `${PREFIX}interview:`,
  period: `${PREFIX}period:`,
  menuClasses: `${PREFIX}menu-classes:`,
  carryClasses: `${PREFIX}carry-classes:`,
};

/** 대화별 진행 값의 키 */
export function draftKey(kind: DraftKind, conversationId: string): string {
  return `${DRAFT_PREFIX[kind]}${conversationId}`;
}

export function defaultStore(): KeyValueStore | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** 그 대화의 진행 값을 지운다 (단계가 끝났을 때) */
export function clearDrafts(conversationId: string, kinds: readonly DraftKind[], store = defaultStore()): void {
  try {
    for (const kind of kinds) store?.removeItem(draftKey(kind, conversationId));
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}

/** 대화 ID와 토큰을 뺀 diet-coach:* 키를 모두 지운다 */
export function clearAll(store = defaultStore()): void {
  try {
    if (!store) return;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX) && key !== CONVERSATION_KEY && key !== TOKEN_KEY) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    // 위와 같음
  }
}
