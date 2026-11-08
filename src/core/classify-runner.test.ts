// 메뉴 분류 도구(classify_menus)의 분기 (B5·B6 리뷰 12번, tasks.md T9-5). 가짜 분류기로 확인한다.
import { describe, expect, it } from 'vitest';
import { classesA, profileA } from './__fixtures__/persona-a.ts';
import { BAD_EVENTS_MESSAGE, handleClassifyRequest, NO_INTERVIEW_MESSAGE } from './classify-runner.ts';
import type { InterviewResult } from './interview.ts';
import { LLM_TIMEOUT_MESSAGE, LlmTimeoutError } from './llm-timeout.ts';
import type { MenuClassifier } from './menu-classifier.ts';
import { formatClassifyRequest } from './plan-request.ts';
import { QUOTA_EXCEEDED_MESSAGE, QuotaExceededError } from './quota.ts';
import { TOOL_ERROR_MESSAGE } from './tool-failure.ts';
import type { MenuClassification } from './types.ts';

const { goals, goalNote, medication, avoid, avoidNote, meals } = profileA;
const resultA: InterviewResult = { goals, goalNote, medication, avoid, avoidNote, meals };
const USAGE = { model: 'fake', input: 10, output: 20 };
const NOW = new Date('2026-11-07T10:00:00+09:00'); // 토요일 → 다음 월요일 2026-11-09

function fakeClassifier(reply: MenuClassification[] | Error) {
  let calls = 0;
  const classifier: MenuClassifier = {
    async classify() {
      calls++;
      if (reply instanceof Error) throw reply;
      return { value: structuredClone(reply), usage: USAGE };
    },
  };
  return { classifier, calls: () => calls };
}

const run = (classifier: MenuClassifier, body: string | undefined, interviewResult: InterviewResult | undefined) =>
  handleClassifyRequest({ interviewResult, body, classifier, now: () => NOW, neurons: (u) => u.length * 7 });

describe('handleClassifyRequest', () => {
  it('인터뷰가 없으면 분류기를 부르지 않고 no_interview', async () => {
    const fake = fakeClassifier(classesA);
    const out = await run(fake.classifier, formatClassifyRequest({ events: [] }), undefined);
    expect(out).toEqual({ output: { status: 'no_interview', message: NO_INTERVIEW_MESSAGE, stats: { seconds: 0, usages: [], neurons: 0 } } });
    expect(fake.calls()).toBe(0);
  });

  it('요청 형식이 깨졌거나 사용자 메시지가 아니면 bad_request, 분류기를 부르지 않는다', async () => {
    for (const body of ['메뉴 분류 요청:\n{"events":', undefined]) {
      const fake = fakeClassifier(classesA);
      const out = await run(fake.classifier, body, resultA);
      expect(out).toEqual({
        output: { status: 'bad_request', message: BAD_EVENTS_MESSAGE, issues: [], stats: { seconds: 0, usages: [], neurons: 0 } },
      });
      expect(fake.calls()).toBe(0);
    }
  });

  it('일정이 끼니에 맞지 않으면 bad_request와 issues', async () => {
    const fake = fakeClassifier(classesA);
    const out = await run(fake.classifier, formatClassifyRequest({ events: [{ day: 'mon', meal: 'breakfast', note: '조찬' }] }), resultA);
    expect(out.output).toMatchObject({ status: 'bad_request', issues: [{ code: 'not_meal', slot: { day: 'mon', meal: 'breakfast' } }] });
    expect(out.save).toBeUndefined();
    expect(fake.calls()).toBe(0);
  });

  it('정상이면 ok, 분류와 기간(이때 정한 시작일, 정리한 일정)을 저장하라고 돌려준다', async () => {
    const fake = fakeClassifier(classesA);
    const out = await run(fake.classifier, formatClassifyRequest({ events: [{ day: 'wed', meal: 'dinner', note: ' 팀  회식 ' }] }), resultA);
    const period = { weekStart: '2026-11-09', events: [{ day: 'wed', meal: 'dinner', note: '팀 회식' }] };
    expect(out.output).toMatchObject({ status: 'ok', period, stats: { usages: [USAGE], neurons: 7 } });
    expect(out.save?.period).toEqual(period);
    expect(out.save?.classes.map((c) => c.menu)).toEqual(['국밥', '백반', '돈가스', '쌀국수', '회덮밥']);
  });

  it.each([
    ['한도 초과', new QuotaExceededError(), 'quota', QUOTA_EXCEEDED_MESSAGE],
    ['시간 초과', new LlmTimeoutError(1_000), 'timeout', LLM_TIMEOUT_MESSAGE],
    ['그 밖의 에러', new Error('boom'), 'error', TOOL_ERROR_MESSAGE],
  ])('%s면 그 status이고 분류도 기간도 저장하지 않는다', async (_, error, status, message) => {
    const out = await run(fakeClassifier(error).classifier, formatClassifyRequest({ events: [] }), resultA);
    expect(out.output).toMatchObject({ status, message });
    expect(out.save).toBeUndefined();
  });

  it('1:1이 아닌 분류(분류기 결과 오류)도 던지지 않고 error', async () => {
    const out = await run(fakeClassifier(classesA.slice(1)).classifier, formatClassifyRequest({ events: [] }), resultA);
    expect(out.output).toMatchObject({ status: 'error', message: TOOL_ERROR_MESSAGE });
    expect(out.save).toBeUndefined();
  });
});

describe('handleClassifyRequest 이전 분류 (B16 T12-4)', () => {
  it('요청에 실린 이전 분류로 모든 메뉴가 덮이면 분류기를 부르지 않고 ok, Neuron 0', async () => {
    const { classifier, calls } = fakeClassifier(new Error('부르면 안 됨'));
    const out = await run(classifier, formatClassifyRequest({ events: [], known: classesA }), resultA);
    expect(calls()).toBe(0);
    expect(out.output.status).toBe('ok');
    expect(out.output.stats.neurons).toBe(0);
  });
});
