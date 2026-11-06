// 스펙 11.4 Neuron 계산. 단가는 테스트용 고정값을 쓴다 (실제 단가 확인은 src/agents/models.test.ts).
import { describe, expect, it } from 'vitest';
import { estimateNeurons, totalNeurons, UnknownModelPriceError, type NeuronPriceTable } from './neurons.ts';

const prices: NeuronPriceTable = {
  a: { inputPerM: 1_000_000, outputPerM: 2_000_000 }, // 토큰당 1, 2 Neuron
  b: { inputPerM: 500_000, outputPerM: 0 },
};

describe('estimateNeurons', () => {
  it('입력·출력 토큰에 각각 단가를 곱해 더한다', () => {
    expect(estimateNeurons({ model: 'a', input: 10, output: 3 }, prices)).toBe(16);
  });

  it('반올림하지 않는다', () => {
    expect(estimateNeurons({ model: 'b', input: 3, output: 100 }, prices)).toBe(1.5);
  });

  it('토큰이 0이면 0', () => {
    expect(estimateNeurons({ model: 'a', input: 0, output: 0 }, prices)).toBe(0);
  });

  it('단가를 모르는 모델이면 0으로 세지 않고 에러 (기본)', () => {
    expect(() => estimateNeurons({ model: 'unknown', input: 1, output: 1 }, prices)).toThrow(UnknownModelPriceError);
  });

  it('프로토타입 속성 이름의 모델도 모르는 모델로 본다', () => {
    expect(() => estimateNeurons({ model: 'constructor', input: 1, output: 1 }, prices)).toThrow(UnknownModelPriceError);
    expect(() => estimateNeurons({ model: '__proto__', input: 1, output: 1 }, prices)).toThrow(UnknownModelPriceError);
  });

  it("'max-price'면 입력·출력 각각 가장 비싼 단가로 세고 경고를 부른다", () => {
    const warned: string[] = [];
    const policy = { unknownModel: 'max-price' as const, onUnknownModel: (m: string) => warned.push(m) };

    // 입력 최고 1,000,000(a), 출력 최고 2,000,000(a) → 토큰당 1, 2
    expect(estimateNeurons({ model: 'unknown', input: 10, output: 3 }, prices, policy)).toBe(16);
    expect(warned).toEqual(['unknown']);
  });

  it("'max-price'여도 아는 모델은 그 모델 단가로 세고 경고하지 않는다", () => {
    const warned: string[] = [];
    const policy = { unknownModel: 'max-price' as const, onUnknownModel: (m: string) => warned.push(m) };

    expect(estimateNeurons({ model: 'b', input: 4, output: 9 }, prices, policy)).toBe(2);
    expect(warned).toEqual([]);
  });

  it("'max-price'인데 단가표가 비었으면 에러", () => {
    expect(() =>
      estimateNeurons({ model: 'unknown', input: 1, output: 1 }, {}, { unknownModel: 'max-price' }),
    ).toThrow(UnknownModelPriceError);
  });
});

describe('totalNeurons', () => {
  it('모델이 섞인 호출들을 모델별 단가로 계산해 더한다', () => {
    const usages = [
      { model: 'a', input: 10, output: 3 },
      { model: 'b', input: 4, output: 9 },
    ];
    expect(totalNeurons(usages, prices)).toBe(18);
  });

  it('호출이 없으면 0', () => {
    expect(totalNeurons([], prices)).toBe(0);
  });
});
