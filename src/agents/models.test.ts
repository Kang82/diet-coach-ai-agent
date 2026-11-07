// 스펙 11.4. 실제 단가로 계산한 값이 11.5 측정 기록과 맞는지 확인한다.
import { describe, expect, it } from 'vitest';
import { estimateNeurons } from '../core/neurons.ts';
import { goalNoteModel, menuClassModel, MODEL_CANDIDATES, NEURON_PRICES, planModel, planThinking } from './models.ts';

describe('goalNoteModel', () => {
  it('키가 후보에 있으면 그 모델, 아니면 llama-4-scout', () => {
    expect(goalNoteModel('gemma')).toBe(MODEL_CANDIDATES.gemma);
    expect(goalNoteModel(undefined)).toBe(MODEL_CANDIDATES.llamaScout);
    expect(goalNoteModel('toString')).toBe(MODEL_CANDIDATES.llamaScout);
  });
});

describe('menuClassModel', () => {
  it('키가 후보에 있으면 그 모델, 아니면 gemma (B6: llama-4-scout는 출력 256토큰에서 잘림)', () => {
    expect(menuClassModel('llamaScout')).toBe(MODEL_CANDIDATES.llamaScout);
    expect(menuClassModel('')).toBe(MODEL_CANDIDATES.gemma);
  });
});

describe('planModel (B14, T8-7)', () => {
  it('키가 후보에 있으면 그 모델, 아니면 undefined(기본 모델 gemma를 그대로 씀)', () => {
    expect(planModel('gptOss120b')).toBe(MODEL_CANDIDATES.gptOss120b);
    expect(planModel(undefined)).toBeUndefined();
    expect(planModel('toString')).toBeUndefined();
  });

  it('gpt-oss-120b 단가: $0.35 / $0.75 per M, $0.011 = 1,000 Neuron', () => {
    expect(NEURON_PRICES[MODEL_CANDIDATES.gptOss120b]).toEqual({ inputPerM: 31_818, outputPerM: 68_182 });
  });
});

describe('planThinking', () => {
  it('low·medium·high만 받고, off·모르는 값·없음은 Flue 기본값(undefined)', () => {
    expect(planThinking('low')).toBe('low');
    expect(planThinking('medium')).toBe('medium');
    expect(planThinking('high')).toBe('high');
    expect(planThinking('off')).toBeUndefined();
    expect(planThinking('LOW')).toBeUndefined();
    expect(planThinking(undefined)).toBeUndefined();
  });
});

describe('NEURON_PRICES', () => {
  it('모든 후보 모델의 단가가 있다', () => {
    for (const id of Object.values(MODEL_CANDIDATES)) {
      expect(NEURON_PRICES).toHaveProperty([id]);
    }
  });

  it.each([
    // 스펙 11.5 측정 기록: 모델, 입력, 출력, 기록한 Neuron
    ['gemma', 1_199, 1_654, 56],
    ['gemma', 1_648, 6_226, 185],
    ['gemma', 1_648, 6_974, 205],
    ['glm', 5_051, 2_492, 118],
  ] as const)('%s 입력 %i, 출력 %i → 약 %i Neuron', (name, input, output, expected) => {
    const neurons = estimateNeurons({ model: MODEL_CANDIDATES[name], input, output }, NEURON_PRICES);
    expect(Math.round(neurons)).toBe(expected);
  });
});
