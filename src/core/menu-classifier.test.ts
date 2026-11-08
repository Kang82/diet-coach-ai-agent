// 메뉴 분류 실행 (스펙 4.2, tasks.md B5). 가짜 분류기로 확인한다.
import { describe, expect, it } from 'vitest';
import { classesA, profileA } from './__fixtures__/persona-a.ts';
import { rulesA } from './__fixtures__/rules-a.ts';
import type { ClassifyInput } from './menu-classification.ts';
import { runClassification, type MenuClassifier } from './menu-classifier.ts';
import { LlmTimeoutError } from './llm-timeout.ts';
import { QuotaExceededError } from './quota.ts';
import type { MenuClassification } from './types.ts';

const USAGE = { model: 'fake', input: 10, output: 20 };

function fakeClassifier(reply: MenuClassification[] | Error) {
  const calls: ClassifyInput[] = [];
  const classifier: MenuClassifier = {
    async classify(input) {
      calls.push(structuredClone(input));
      if (reply instanceof Error) throw reply;
      return { value: structuredClone(reply), usage: USAGE };
    },
  };
  return { classifier, calls };
}

describe('runClassification', () => {
  it('페르소나 A: 대상 메뉴와 기준으로 한 번 부르고 대상 순서로 돌려준다', async () => {
    const { classifier, calls } = fakeClassifier(classesA);
    const out = await runClassification(classifier, profileA);
    expect(calls).toEqual([{ menus: ['국밥', '백반', '돈가스', '쌀국수', '회덮밥'], rules: rulesA, avoid: ['dairy'] }]);
    expect(out).toEqual({
      kind: 'ok',
      classes: ['국밥', '백반', '돈가스', '쌀국수', '회덮밥'].map((m) => classesA.find((c) => c.menu === m)),
      usages: [USAGE],
    });
  });

  it('외식 끼니가 없으면 부르지 않고 빈 분류', async () => {
    const { classifier, calls } = fakeClassifier(classesA);
    const meals = profileA.meals.map((m) => (m.place === 'eat_out' ? { ...m, place: 'home' as const, menus: undefined } : m));
    expect(await runClassification(classifier, { ...profileA, meals })).toEqual({ kind: 'ok', classes: [], usages: [] });
    expect(calls).toEqual([]);
  });

  it('한도 초과면 quota', async () => {
    const { classifier } = fakeClassifier(new QuotaExceededError());
    expect(await runClassification(classifier, profileA)).toEqual({ kind: 'quota', usages: [] });
  });

  it('시간 초과면 timeout (B6)', async () => {
    const { classifier } = fakeClassifier(new LlmTimeoutError(60_000));
    expect(await runClassification(classifier, profileA)).toEqual({ kind: 'timeout', usages: [] });
  });

  it('결과가 대상과 1:1이 아니면 에러', async () => {
    const { classifier } = fakeClassifier(classesA.slice(1));
    await expect(runClassification(classifier, profileA)).rejects.toThrow(/회덮밥/);
  });

  it('그 밖의 에러는 그대로 던진다', async () => {
    const { classifier } = fakeClassifier(new Error('boom'));
    await expect(runClassification(classifier, profileA)).rejects.toThrow('boom');
  });
});

// B16 T12-4: 이전 대화에서 정한 분류는 다시 모델에 보내지 않는다
describe('runClassification 이전 분류 재사용', () => {
  const byName = (m: string) => classesA.find((c) => c.menu === m)!;

  it('모든 메뉴가 있으면 분류기를 부르지 않는다', async () => {
    const { classifier, calls } = fakeClassifier(new Error('부르면 안 됨'));
    const out = await runClassification(classifier, profileA, classesA);
    expect(calls).toEqual([]);
    expect(out).toEqual({ kind: 'ok', classes: ['국밥', '백반', '돈가스', '쌀국수', '회덮밥'].map(byName), usages: [] });
  });

  it('일부만 있으면 남은 메뉴만 보내고 대상 순서로 합친다', async () => {
    const { classifier, calls } = fakeClassifier([byName('돈가스'), byName('회덮밥')]);
    const known = [byName('국밥'), byName('백반'), byName('쌀국수'), { ...byName('국밥'), menu: '대상에 없는 메뉴' }];
    const out = await runClassification(classifier, profileA, known);
    expect(calls.map((c) => c.menus)).toEqual([['돈가스', '회덮밥']]);
    expect(out).toEqual({ kind: 'ok', classes: ['국밥', '백반', '돈가스', '쌀국수', '회덮밥'].map(byName), usages: [USAGE] });
  });

  it('지금 기준에 없는 기준 ID는 거른다', async () => {
    const { classifier } = fakeClassifier([]);
    const known = classesA.map((c) => (c.menu === '국밥' ? { ...c, criterionIds: ['reduce_refined_carbs' as const, ...c.criterionIds] } : c));
    const out = await runClassification(classifier, profileA, known);
    expect(out.kind === 'ok' && out.classes[0]).toEqual(byName('국밥'));
  });

  it('모델이 이월한 메뉴까지 다시 내면 1:1이 아니라 에러', async () => {
    const { classifier } = fakeClassifier([byName('돈가스'), byName('회덮밥'), byName('국밥')]);
    await expect(runClassification(classifier, profileA, [byName('국밥'), byName('백반'), byName('쌀국수')])).rejects.toThrow(/맞지 않습니다/);
  });
});
