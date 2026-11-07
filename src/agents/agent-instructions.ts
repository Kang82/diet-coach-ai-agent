// 인터뷰 뒤 바깥 턴 지시 (diet-coach.ts). 메시지 종류마다 마운트한 도구 하나만 안내한다 (T10-2).
// 도구를 부르라는 지시에는 "사용자 메시지가 <접두어>로 시작하면" 조건을 붙인다 (tasks.md B14 T8-7).
// 도구 안 harness.prompt는 이 지시를 그대로 물려받는데, 그 대화의 사용자 메시지는 생성 프롬프트라 접두어로 시작하지 않는다.
// 조건 없이 "도구를 부르세요"라고만 두면 gpt-oss-120b가 도구 안에서 finish 대신 바깥 도구를 불렀다.
import { EDIT_REQUEST_PREFIX } from '../core/edit-request.ts';
import type { MessageKind } from '../core/message-kind.ts';
import { CLASSIFY_REQUEST, PLAN_REQUEST_PREFIX } from '../core/plan-request.ts';
import { CLASSIFY_TOOL } from './classify-menus-tool.ts';
import { CREATE_PLAN_TOOL } from './create-plan-tool.ts';
import { EDIT_PLAN_TOOL } from './edit-plan-tool.ts';

export const AFTER_INTERVIEW_STEPS: Record<MessageKind, string> = {
  edit: `사용자 메시지가 "${EDIT_REQUEST_PREFIX}"로 시작하면 ${EDIT_PLAN_TOOL} 도구를 한 번 부르세요. 칸과 요청은 도구가 메시지에서 직접 읽으므로 입력은 비워 두세요.`,
  classify: `사용자 메시지가 "${CLASSIFY_REQUEST}"로 시작하면 ${CLASSIFY_TOOL} 도구를 한 번 부르세요. 메뉴와 일정은 도구가 직접 읽으므로 입력은 비워 두세요.`,
  plan: `사용자 메시지가 "${PLAN_REQUEST_PREFIX}"로 시작하면 ${CREATE_PLAN_TOOL} 도구를 한 번 부르세요. 바꾼 분류는 도구가 메시지에서 직접 읽으므로 입력은 비워 두세요.`,
  interview: '인터뷰는 이미 끝났습니다. 화면에서 다음 단계로 진행해 달라고 한 문장으로만 답하세요.',
  chat: `식단표 만들기, 칸 바꾸기, 메뉴 분류는 화면의 버튼으로 합니다("${PLAN_REQUEST_PREFIX}", "${EDIT_REQUEST_PREFIX}", "${CLASSIFY_REQUEST}"로 시작하는 메시지). 화면의 버튼을 눌러 달라고 한 문장으로만 답하세요.`,
};
