// B13(T10-2, T10-3). 화면이 보낸 메시지의 종류를 접두어로 가린다.
// 한도 보호 미들웨어(종류별 하루 횟수, 진행 중 예약)와 에이전트(종류에 맞는 도구 하나만 마운트)가 이 함수 하나를 쓴다.
// 그래서 미들웨어가 접두어로 센 것과 실제로 도는 비싼 도구가 어긋나지 않는다. 판정은 각 도구가 쓰는 is* 함수와 같다.
import { isEditRequest } from './edit-request.ts';
import { isInterviewSubmission } from './interview-form.ts';
import { isClassifyRequest, isPlanRequest } from './plan-request.ts';

export type MessageKind = 'interview' | 'classify' | 'plan' | 'edit' | 'chat';

/** LLM을 오래 부르는 도구가 붙는 종류. 하루 횟수와 진행 중 예약을 건다 */
export const EXPENSIVE_KINDS = ['classify', 'plan', 'edit'] as const;
export type ExpensiveKind = (typeof EXPENSIVE_KINDS)[number];

export function messageKind(body: string): MessageKind {
  if (isInterviewSubmission(body)) return 'interview';
  if (isClassifyRequest(body)) return 'classify';
  if (isPlanRequest(body)) return 'plan';
  if (isEditRequest(body)) return 'edit';
  return 'chat';
}

export function isExpensiveKind(kind: MessageKind): kind is ExpensiveKind {
  return (EXPENSIVE_KINDS as readonly string[]).includes(kind);
}
