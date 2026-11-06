// 목표 메모 확인 (스펙 4.1, tasks.md B4)
import { describe, expect, it } from 'vitest';
import { buildGoalNotePrompt, goalNoteUpdate } from './interview-note.ts';

describe('buildGoalNotePrompt', () => {
  it('고른 목표와 메모, 판단 기준이 들어간다', () => {
    const prompt = buildGoalNotePrompt({ goals: ['weight_loss'], note: '한 달에 10kg' });
    expect(prompt).toContain('체중 감량');
    expect(prompt).toContain('"한 달에 10kg"');
    for (const id of ['pregnancy', 'kidney_disease', 'extreme_restriction', 'unsupported_goal', 'asks_medication_advice']) {
      expect(prompt).toContain(id);
    }
  });
});

describe('goalNoteUpdate', () => {
  it('무리한 목표면 선택지를 goals의 ambiguous로', () => {
    expect(goalNoteUpdate({ stopFlags: [], turnFlags: ['extreme_restriction'], choices: ['한 달에 2kg 감량'] })).toEqual({
      filled: {},
      stopFlags: [],
      turnFlags: ['extreme_restriction'],
      ambiguous: { field: 'goals', choices: ['한 달에 2kg 감량'] },
    });
  });

  it('무리한 목표가 아니면 선택지는 버린다 (분기 5로 가지 않게)', () => {
    expect(goalNoteUpdate({ stopFlags: ['pregnancy'], turnFlags: [], choices: ['x'] })).toEqual({
      filled: {},
      stopFlags: ['pregnancy'],
      turnFlags: [],
    });
  });
});
