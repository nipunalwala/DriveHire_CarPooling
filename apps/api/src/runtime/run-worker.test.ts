import { describe, expect, it } from 'vitest';
import { runWorker } from './run-worker.js';

describe('worker shutdown', () => {
  it('waits for the active tick and never begins another after abort', async () => {
    const controller = new AbortController();
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let ticks = 0;
    const active = runWorker({
      signal: controller.signal,
      intervalMs: 1,
      tick: async () => {
        ticks++;
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      onError: () => {},
    });
    await entered;
    controller.abort();
    release();
    await active;
    expect(ticks).toBe(1);
  });
  it('does not begin a tick if shutdown already started', async () => {
    const controller = new AbortController();
    controller.abort();
    let ticks = 0;
    await runWorker({
      signal: controller.signal,
      intervalMs: 1,
      tick: async () => {
        ticks++;
      },
      onError: () => {},
    });
    expect(ticks).toBe(0);
  });
});
