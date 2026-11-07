// B13(T10-2). 모델이 한 응답에서 비싼 도구를 여러 번(병렬) 불러도 하나만 돌게 하는 게이트.
// Flue는 모델을 부르기 전마다 에이전트 함수를 다시 렌더하므로, 렌더마다 게이트를 새로 만들어 그 렌더의 도구에 넘긴다.
// 그 응답의 도구 호출들은 같은 게이트를 본다. durable 도구는 claim 결과를 step에 기록해 복구 때도 같은 호출이 이긴다.
export interface ToolGate {
  /** 처음 부른 쪽만 true */
  claim(): boolean;
}

export function createToolGate(): ToolGate {
  let claimed = false;
  return {
    claim() {
      if (claimed) return false;
      claimed = true;
      return true;
    },
  };
}

/** 게이트에 진 호출의 결과 문구. 화면은 status 'duplicate'인 도구 부분을 건너뛴다 */
export const DUPLICATE_TOOL_MESSAGE = '같은 요청이 이미 진행 중이에요.';

/** 도구 출력(객체 또는 JSON 문자열)이 게이트에 진 호출의 결과인지. 화면이 건너뛸 때 쓴다 */
export function isDuplicateOutput(output: unknown): boolean {
  let value = output;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return typeof value === 'object' && value !== null && (value as { status?: unknown }).status === 'duplicate';
}
