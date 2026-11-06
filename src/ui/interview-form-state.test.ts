// 인터뷰 화면의 진행 상태 (스펙 4.1, tasks.md B4)
import { describe, expect, it } from 'vitest';
import { goalsUpdate, medicationUpdate } from '../core/interview-form.ts';
import { advance, resolveProgress, restoreProgress, startProgress, type ServerAsk } from './interview-form-state.ts';

const stats = { seconds: 3, usages: [], neurons: 20 };
const serverAsk = (id: string): ServerAsk => ({
  id,
  output: {
    status: 'ask',
    message: { text: '무리하지 않는 목표로', choices: ['한 달에 2kg 감량'] },
    state: { draft: { goals: ['weight_loss'], goalNote: '한 달에 10kg' }, stopFlags: [], menuFollowUps: [] },
    next: { kind: 'ask', field: 'goals', reason: 'extreme_restriction', choices: ['한 달에 2kg 감량'] },
    stats,
  },
});

describe('advance', () => {
  it('답을 반영하고 다음 단계. 그냥 다음 질문이면 안내는 없다', () => {
    const p = advance(startProgress(), goalsUpdate({ goals: ['cholesterol'], goalNote: '', stopFlags: [] }));
    expect(p.next).toEqual({ kind: 'ask', field: 'medication' });
    expect(p.message).toBeUndefined();
  });

  it('중단이면 안내가 붙는다', () => {
    const start = advance(startProgress(), goalsUpdate({ goals: ['blood_glucose'], goalNote: '', stopFlags: [] }));
    const p = advance(start, medicationUpdate('glucose'));
    expect(p.next.kind).toBe('stop');
    expect(p.message?.text).toContain('혈당약');
  });

  it('이어받은 서버 ask를 기억한다', () => {
    const p = advance({ ...startProgress(), basedOn: 'call-1' }, goalsUpdate({ goals: ['weight_loss'], goalNote: '', stopFlags: [] }));
    expect(p.basedOn).toBe('call-1');
  });
});

describe('resolveProgress', () => {
  it('저장된 것도 서버 ask도 없으면 처음부터', () => {
    expect(resolveProgress(null, undefined)).toEqual(startProgress());
    expect(startProgress().next).toEqual({ kind: 'ask', field: 'goals' });
  });

  it('저장된 진행을 복원한다', () => {
    const p = advance(startProgress(), goalsUpdate({ goals: ['weight_loss'], goalNote: '', stopFlags: [] }));
    expect(resolveProgress(JSON.stringify(p), undefined)).toEqual(p);
  });

  it('새 서버 ask면 그 상태에서 이어 간다', () => {
    const p = resolveProgress(JSON.stringify(startProgress()), serverAsk('call-1'));
    expect(p).toEqual({
      state: serverAsk('call-1').output.state,
      next: serverAsk('call-1').output.next,
      message: serverAsk('call-1').output.message,
      basedOn: 'call-1',
    });
  });

  it('이미 이어받은 서버 ask면 저장된 진행을 쓴다', () => {
    const saved = advance({ ...startProgress(), basedOn: 'call-1' }, goalsUpdate({ goals: ['weight_loss'], goalNote: '', stopFlags: [] }));
    expect(resolveProgress(JSON.stringify(saved), serverAsk('call-1'))).toEqual(saved);
  });
});

describe('restoreProgress', () => {
  it.each([['빈 값', ''], ['깨진 JSON', '{'], ['모양이 다름', '{"state":{},"next":{"kind":"ask"}}'], ['모르는 kind', JSON.stringify({ ...startProgress(), next: { kind: 'x' } })]])(
    '%s면 undefined',
    (_, raw) => {
      expect(restoreProgress(raw)).toBeUndefined();
    },
  );

  it('정상 값', () => {
    expect(restoreProgress(JSON.stringify(startProgress()))).toEqual(startProgress());
  });
});
