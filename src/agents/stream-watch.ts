// Workers AI 응답 스트림 관찰 (B19, tasks.md T8-8). 시간 초과가 "모델 무응답"인지 가리려고 한 LLM 호출 동안
// 바인딩 응답 본문에 바이트가 오는 시각을 잰다. 본문 내용은 보지 않는다(건강 정보).
//
// Flue는 우리가 넘긴 signal을 AbortSignal.any로 감싸 공급자에 넘겨서 signal로는 호출을 이을 수 없고,
// 무응답 재요청(streamIdleTimeoutMs)을 알려 주는 훅도 없다. 그래서 호출마다 AsyncLocalStorage 저장소를 열고
// (prompt-call.ts), 바인딩(env.AI)의 run을 감싸 그 저장소에 기록한다(provider.ts). Flue도 AsyncLocalStorage를 쓴다.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { StreamStats } from '../core/llm-timeout.ts';

export interface StreamWatch {
  readonly now: () => number;
  readonly startedAt: number;
  requests: number;
  firstByteAt: number | null;
  lastActivityAt: number;
  maxGapMs: number;
}

const storage = new AsyncLocalStorage<StreamWatch>();

export function createWatch(now: () => number = Date.now): StreamWatch {
  const startedAt = now();
  return { now, startedAt, requests: 0, firstByteAt: null, lastActivityAt: startedAt, maxGapMs: 0 };
}

/** fn 안(과 그 안에서 이어지는 비동기 일)의 바인딩 요청을 watch에 기록한다 */
export function runWatched<T>(watch: StreamWatch, fn: () => T): T {
  return storage.run(watch, fn);
}

/** 지금까지의 결과. 마지막 활동부터 지금까지의 간격도 넣는다(멈춘 채 끝난 경우) */
export function streamStats(watch: StreamWatch, now: () => number = watch.now): StreamStats {
  const t = now();
  return {
    requests: watch.requests,
    firstByteMs: watch.firstByteAt === null ? null : watch.firstByteAt - watch.startedAt,
    maxGapMs: Math.max(watch.maxGapMs, t - watch.lastActivityAt),
  };
}

/** 활동(요청 시작, 바이트 도착) 사이 간격을 잰다. 요청 시작 → 첫 바이트도 간격이다 */
function touch(watch: StreamWatch, byte: boolean): void {
  const t = watch.now();
  watch.maxGapMs = Math.max(watch.maxGapMs, t - watch.lastActivityAt);
  watch.lastActivityAt = t;
  if (byte && watch.firstByteAt === null) watch.firstByteAt = t;
}

type RunFn = (...args: any[]) => Promise<unknown>;

/**
 * binding.run만 감싼 바인딩. 지켜보는 호출 안이면 요청을 세고, Response 본문을 바이트 시각을 기록하는 본문으로 바꾼다.
 * 지켜보는 호출 밖이거나 Response가 아니면 그대로 돌려준다. 다른 속성(models 등)은 원래 바인딩의 것을 쓴다
 */
export function watchBinding<B extends { run: RunFn }>(binding: B): B {
  // 배포 시작 검증(전역 평가)에서는 env.AI가 아직 없다. 감싸지 않고 그대로 넘긴다(2026-11-08 배포 실패 10021)
  if (typeof binding !== 'object' || binding === null) return binding;
  const run: RunFn = async (...args) => {
    const watch = storage.getStore();
    if (!watch) return binding.run(...args);
    watch.requests += 1;
    touch(watch, false);
    const result = await binding.run(...args);
    if (!(result instanceof Response) || !result.body) return result;
    const observed = result.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          touch(watch, true);
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(observed, { status: result.status, statusText: result.statusText, headers: result.headers });
  };
  return new Proxy(binding, {
    get(target, prop) {
      if (prop === 'run') return run;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
