// "외식 메뉴 고치기" (B16 T12-3). 분류 확인 화면에서 지금 프로필을 채운 새 대화의 프로필 확인 화면으로 간다.
// 새 대화에 인터뷰 진행(프로필 확인 화면부터), 기간 화면의 일정, 이전 분류(다시 분류할 때 같은 메뉴는 모델에 보내지 않음)를 넣어 둔다.
// 인터뷰는 이미 끝난 대화에서 다시 할 수 없어서(도구가 하나씩만 붙음) 새 대화로 간다. 값은 모두 localStorage(대화 ID별)에 둔다.
import type { InterviewResult } from '../core/interview.ts';
import type { MenuClassification, PlanEvent } from '../core/types.ts';
import { draftKey, type KeyValueStore } from './browser-store.ts';
import { progressFromResult } from './interview-form-state.ts';
import type { StartChoice } from './start-choice-state.ts';

export function prepareMenuEdit(
  store: KeyValueStore | undefined,
  conversationId: string,
  { result, events, classes }: { result: InterviewResult; events: readonly PlanEvent[]; classes: readonly MenuClassification[] },
): StartChoice {
  try {
    store?.setItem(draftKey('interview', conversationId), JSON.stringify(progressFromResult(result)));
    store?.setItem(draftKey('period', conversationId), JSON.stringify(events.map(({ day, meal, note }) => ({ day, meal, note }))));
    store?.setItem(draftKey('carryClasses', conversationId), JSON.stringify(classes));
  } catch {
    // 저장소를 못 쓰면 새 대화가 처음 단계부터 시작한다
  }
  // 저장에 동의했던 사람은 동의를 켠 채로(edit_saved), 아니면 끈 채로 프로필 확인 화면을 연다
  return result.consentedAt ? 'edit_saved' : 'fresh';
}

/** 다시 분류할 때 요청에 실을 이전 분류. 없거나 깨졌으면 빈 배열(서버가 형식을 다시 검증한다) */
export function loadCarryClasses(store: KeyValueStore | undefined, conversationId: string): MenuClassification[] {
  try {
    const value: unknown = JSON.parse(store?.getItem(draftKey('carryClasses', conversationId)) ?? '[]');
    return Array.isArray(value) ? (value as MenuClassification[]) : [];
  } catch {
    return [];
  }
}
