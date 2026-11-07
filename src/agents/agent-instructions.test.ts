// tasks.md B14 T8-7: 도구를 부르라는 바깥 지시는 접두어 조건을 붙여, 지시를 물려받는 도구 안 대화에서는 걸리지 않게 한다
import { describe, expect, it } from 'vitest';
import { EDIT_REQUEST_PREFIX } from '../core/edit-request.ts';
import { CLASSIFY_REQUEST, PLAN_REQUEST_PREFIX } from '../core/plan-request.ts';
import { AFTER_INTERVIEW_STEPS } from './agent-instructions.ts';

describe('AFTER_INTERVIEW_STEPS', () => {
  it.each([
    ['plan', PLAN_REQUEST_PREFIX, 'create_week_plan'],
    ['edit', EDIT_REQUEST_PREFIX, 'edit_plan_cells'],
    ['classify', CLASSIFY_REQUEST, 'classify_menus'],
  ] as const)('%s: 접두어로 시작할 때만 그 도구를 부르라고 한다', (kind, prefix, tool) => {
    expect(AFTER_INTERVIEW_STEPS[kind].startsWith(`사용자 메시지가 "${prefix}"로 시작하면 ${tool} 도구를 한 번 부르세요.`)).toBe(true);
  });

  it('인터뷰·자유 문장에는 도구를 부르라는 지시가 없다', () => {
    for (const kind of ['interview', 'chat'] as const) {
      expect(AFTER_INTERVIEW_STEPS[kind]).not.toMatch(/도구를 한 번 부르세요/);
    }
  });
});
