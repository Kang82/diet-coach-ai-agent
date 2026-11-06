// 스펙 11.4. 실제 단가로 계산한 값이 11.5 측정 기록과 맞는지 확인한다.
import { describe, expect, it } from 'vitest';
import { estimateNeurons } from '../core/neurons.ts';
import { goalNoteModel, MODEL_CANDIDATES, NEURON_PRICES } from './models.ts';

describe('goalNoteModel', () => {
  it('키가 후보에 있으면 그 모델, 아니면 llama-4-scout', () => {
    expect(goalNoteModel('gemma')).toBe(MODEL_CANDIDATES.gemma);
    expect(goalNoteModel(undefined)).toBe(MODEL_CANDIDATES.llamaScout);
    expect(goalNoteModel('toString')).toBe(MODEL_CANDIDATES.llamaScout);
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
