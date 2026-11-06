// 에이전트(Durable Object) 안에서 Worker 전체 Neuron 카운터에 더하는 meter (스펙 11.4-3).
// 'cloudflare:workers'는 이 파일에서만 import한다. 단위 테스트(Node)에서 불러오는 파일에는 넣지 않는다.
import { env } from 'cloudflare:workers';
import { utcDay } from '../core/guard.ts';
import type { D1Like } from '../storage/d1-storage.ts';
import { D1GuardStore } from '../storage/guard-store.ts';
import type { NeuronMeter } from './metered-harness.ts';

export const usageMeter: NeuronMeter = {
  async add(neurons) {
    if (!(neurons > 0)) return;
    await new D1GuardStore(env.DB as D1Like).addNeurons(utcDay(new Date()), neurons);
  },
};
