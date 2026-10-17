import { setTimeout } from 'node:timers/promises';

export async function runWorker(options: {
  signal: AbortSignal;
  intervalMs: number;
  tick: () => Promise<void>;
  onError: (error: unknown) => void;
}): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await options.tick();
    } catch (error) {
      options.onError(error);
    }
    if (options.signal.aborted) break;
    try {
      await setTimeout(options.intervalMs, undefined, { signal: options.signal });
    } catch (error) {
      if (!options.signal.aborted) throw error;
    }
  }
}
