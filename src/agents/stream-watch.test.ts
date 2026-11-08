// Workers AI 응답 스트림 관찰 (B19, tasks.md T8-8). 가짜 바인딩과 가짜 시계로 본다
import { describe, expect, it } from 'vitest';
import { createWatch, runWatched, streamStats, watchBinding } from './stream-watch.ts';

/** 정해 둔 청크를 하나씩 내보내는 본문. push로 시계를 움직이며 청크를 보낸다 */
function controlledBody() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    body,
    push: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
    close: () => controller.close(),
  };
}

function fakeClock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** 청크가 pipeThrough를 지나 기록될 때까지 기다린다 (가짜 시계라 실제 시간은 거의 안 씀) */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** body 하나를 끝까지 읽는다 */
async function drain(response: Response) {
  const reader = response.body!.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}

function fakeBinding(results: unknown[]) {
  const calls: unknown[][] = [];
  const binding = {
    run: async (...args: unknown[]) => {
      calls.push(args);
      return results.shift();
    },
    models: () => 'models',
  };
  return { binding, calls };
}

describe('watchBinding', () => {
  it('첫 바이트와 청크 사이 가장 긴 간격을 잰다 (요청 시작 → 첫 바이트도 간격)', async () => {
    const clock = fakeClock();
    const stream = controlledBody();
    const { binding } = fakeBinding([new Response(stream.body, { status: 200 })]);
    const watched = watchBinding(binding);
    const watch = createWatch(clock.now);

    const response = (await runWatched(watch, () => watched.run('@cf/m', {}, {}))) as Response;
    const reading = drain(response);
    clock.advance(3_000);
    stream.push('a'); // 첫 바이트까지 3초
    await flush();
    clock.advance(500);
    stream.push('b');
    await flush();
    clock.advance(7_000);
    stream.push('c'); // 7초 간격
    await flush();
    stream.close();
    await reading;

    expect(streamStats(watch, clock.now)).toEqual({ requests: 1, firstByteMs: 3_000, maxGapMs: 7_000 });
    expect(response.status).toBe(200);
  });

  it('끝난 순간까지의 마지막 간격도 넣는다 (멈춘 채 시간 초과)', async () => {
    const clock = fakeClock();
    const stream = controlledBody();
    const { binding } = fakeBinding([new Response(stream.body)]);
    const watch = createWatch(clock.now);

    const response = (await runWatched(watch, () => watchBinding(binding).run('@cf/m', {}))) as Response;
    const reading = drain(response);
    clock.advance(1_000);
    stream.push('a');
    await flush();
    clock.advance(300_000); // 300초 동안 아무것도 안 옴

    expect(streamStats(watch, clock.now)).toEqual({ requests: 1, firstByteMs: 1_000, maxGapMs: 300_000 });
    stream.close();
    await reading;
  });

  it('한 바이트도 안 오면 firstByteMs는 null, 간격은 요청 시작부터', async () => {
    const clock = fakeClock();
    const { binding } = fakeBinding([new Response(controlledBody().body)]);
    const watch = createWatch(clock.now);

    await runWatched(watch, () => watchBinding(binding).run('@cf/m', {}));
    clock.advance(200_000);

    expect(streamStats(watch, clock.now)).toEqual({ requests: 1, firstByteMs: null, maxGapMs: 200_000 });
  });

  it('요청 수를 센다 (Flue의 재요청). 새 요청 전의 침묵도 간격에 넣는다', async () => {
    const clock = fakeClock();
    const { binding, calls } = fakeBinding([new Response(controlledBody().body), new Response('ok')]);
    const watched = watchBinding(binding);
    const watch = createWatch(clock.now);

    await runWatched(watch, async () => {
      await watched.run('@cf/m', {});
      clock.advance(300_000); // Flue 무응답 감지가 끊고
      const second = (await watched.run('@cf/m', {})) as Response; // 같은 요청을 다시 보냄
      clock.advance(2_000);
      await drain(second);
    });

    expect(calls).toHaveLength(2);
    expect(streamStats(watch, clock.now)).toEqual({ requests: 2, firstByteMs: 302_000, maxGapMs: 300_000 });
  });

  it('지켜보는 호출 밖에서는 아무것도 바꾸지 않는다', async () => {
    const original = new Response('ok');
    const { binding } = fakeBinding([original]);

    await expect(watchBinding(binding).run('@cf/m', {})).resolves.toBe(original);
  });

  it('Response가 아닌 결과는 그대로 돌려주고, run 밖의 속성도 그대로다', async () => {
    const clock = fakeClock();
    const plain = { response: 'json' };
    const { binding } = fakeBinding([plain]);
    const watched = watchBinding(binding);
    const watch = createWatch(clock.now);

    await expect(runWatched(watch, () => watched.run('@cf/m', {}))).resolves.toBe(plain);
    expect(watched.models()).toBe('models');
    expect(streamStats(watch, clock.now).requests).toBe(1);
  });
});
