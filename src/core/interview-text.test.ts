// 인터뷰 문장 (스펙 4.1, tasks.md B4). 질문과 안내는 코드 템플릿으로 만든다.
import { describe, expect, it } from 'vitest';
import { profileA } from './__fixtures__/persona-a.ts';
import { buildCriteria } from './criteria.ts';
import { finishDraft } from './interview.ts';
import { formatTurnReply, questionText, summarizeInterviewResult } from './interview-text.ts';
import { SUPPORTED_GOAL_CHOICES } from './interview-turn.ts';
import type { InterviewDraft } from './types.ts';

/** 인터뷰를 끝까지 마친 페르소나 A 초안 */
function draftA(): InterviewDraft {
  const { goals, goalNote, medication, avoid, avoidNote, meals } = structuredClone(profileA);
  return {
    goals,
    goalNote,
    medication,
    avoid,
    avoidNote,
    meals: meals.map((m) => (m.place === 'home' && m.cookMinutes === undefined ? { ...m, cookMinutes: null } : m)),
  };
}

const LUNCH = { dayType: 'weekday', meal: 'lunch' } as const;
const WEEKEND_DINNER = { dayType: 'weekend', meal: 'dinner' } as const;

describe('questionText', () => {
  it('필드마다 다른 질문', () => {
    const texts = ['goals', 'medication', 'avoid', 'meals'].map((f) => questionText(f as 'goals'));
    expect(new Set(texts).size).toBe(4);
    expect(questionText('goals')).toContain('체중 감량, 혈당 관리, 콜레스테롤 관리');
  });

  it('끼니 질문에는 평일/주말과 끼니 이름이 들어간다', () => {
    expect(questionText({ menusFor: LUNCH })).toContain('평일 점심');
    expect(questionText({ cookMinutesFor: WEEKEND_DINNER })).toContain('주말 저녁');
  });
});

describe('formatTurnReply', () => {
  it('다음 질문만', () => {
    expect(formatTurnReply({ kind: 'ask', field: 'avoid' }, [])).toEqual({ text: questionText('avoid') });
  });

  it('극단적 목표: 앞말 + 질문 + LLM 선택지', () => {
    const reply = formatTurnReply(
      { kind: 'ask', field: 'goals', reason: 'extreme_restriction', choices: ['한 달에 2kg 감량'] },
      [],
    );
    expect(reply.text).toContain('무리');
    expect(reply.text.endsWith(questionText('goals'))).toBe(true);
    expect(reply.choices).toEqual(['한 달에 2kg 감량']);
  });

  it('미지원 목표: 지원 목표 3개 선택지', () => {
    const reply = formatTurnReply(
      { kind: 'ask', field: 'goals', reason: 'unsupported_goal', choices: SUPPORTED_GOAL_CHOICES },
      [],
    );
    expect(reply.text).toContain('아직');
    expect(reply.choices).toEqual(['체중 감량', '혈당 관리', '콜레스테롤 관리']);
  });

  it('모호한 답: 앞말 + 질문 + 선택지', () => {
    const reply = formatTurnReply(
      { kind: 'ask', field: { cookMinutesFor: WEEKEND_DINNER }, reason: 'ambiguous', choices: ['20분', '30분'] },
      [],
    );
    expect(reply.text).toContain('골라');
    expect(reply.text).toContain(questionText({ cookMinutesFor: WEEKEND_DINNER }));
    expect(reply.choices).toEqual(['20분', '30분']);
  });

  it('메뉴가 적으면 메뉴를 더 묻고, 없으면 그대로 간다고 알린다', () => {
    const reply = formatTurnReply({ kind: 'ask', field: { menusFor: LUNCH }, reason: 'few_menus' }, []);
    expect(reply.text).toContain('평일 점심');
    expect(reply.text).toContain('없음');
    expect(reply.choices).toBeUndefined();
  });

  it('중단: 플래그마다 안내 + 상담 권고', () => {
    const reply = formatTurnReply({ kind: 'stop', flags: ['pregnancy', 'glucose_medication'] }, []);
    const lines = reply.text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('임신');
    expect(lines[1]).toContain('혈당약');
    expect(lines[2]).toContain('상담');
    expect(reply.choices).toBeUndefined();
  });

  it('신장 질환 안내', () => {
    expect(formatTurnReply({ kind: 'stop', flags: ['kidney_disease'] }, []).text).toContain('신장');
  });

  it('범위 밖 질문 안내는 질문 앞에 나온다', () => {
    const reply = formatTurnReply({ kind: 'ask', field: 'avoid' }, ['asks_lab_interpretation', 'asks_medication_advice']);
    const lines = reply.text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('검사 수치');
    expect(lines[1]).toContain('약');
    expect(lines[2]).toBe(questionText('avoid'));
  });

  it('끝: 확인 안내', () => {
    const result = finishDraft(draftA());
    const reply = formatTurnReply({ kind: 'done', result, criteria: buildCriteria(result.goals) }, []);
    expect(reply.text).toContain('확인');
  });
});

describe('summarizeInterviewResult', () => {
  it('페르소나 A', () => {
    const result = finishDraft(draftA());
    expect(summarizeInterviewResult(result)).toEqual([
      '목표: 체중 감량, 콜레스테롤 관리 (체중 5kg 감량, 콜레스테롤 관리)',
      '관련 약: 없음',
      '피할 음식: 유제품 (우유를 마시면 배가 아파요)',
      '평일 아침: 안 먹음',
      '평일 점심: 외식, 다른 사람과 · 국밥, 백반, 돈가스, 쌀국수, 회덮밥',
      '평일 저녁: 집밥, 혼자 · 20분 안',
      '주말 아침: 안 먹음',
      '주말 점심: 집밥, 가족과 · 조리 시간 상관없음',
      '주말 저녁: 집밥, 가족과 · 조리 시간 상관없음',
    ]);
  });

  it('약 질문을 안 한 목표면 약 줄이 없고, 피할 음식이 없으면 "없음"', () => {
    const result = finishDraft({
      goals: ['weight_loss'],
      avoid: [],
      meals: draftA().meals,
    });
    const lines = summarizeInterviewResult(result);
    expect(lines[0]).toBe('목표: 체중 감량');
    expect(lines[1]).toBe('피할 음식: 없음');
  });
});
