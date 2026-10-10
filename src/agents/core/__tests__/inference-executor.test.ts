import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InProcessInferenceExecutor,
  resetInferenceRunnersForTests,
} from '../inference-executor.js';

describe('InProcessInferenceExecutor', () => {
  beforeEach(() => resetInferenceRunnersForTests());

  it('runs a registered runner, initialising it once across calls and executors', async () => {
    const initialize = vi.fn(async () => undefined);
    const run = vi.fn(async (data: unknown) => ({ eou: 0.9, got: data }));
    class EouRunner {
      initialize = initialize;
      run = run;
    }
    const load = vi.fn(async () => ({ default: EouRunner }));
    const registry = { 'lk_end_of_utterance_en': '/fake/runner.js' };

    const a = new InProcessInferenceExecutor(registry, load);
    const b = new InProcessInferenceExecutor(registry, load);
    expect(await a.doInference('lk_end_of_utterance_en', { text: 'hi' })).toEqual({
      eou: 0.9,
      got: { text: 'hi' },
    });
    await b.doInference('lk_end_of_utterance_en', { text: 'again' });
    expect(load).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('accepts a module whose default export wraps the class (CJS interop)', async () => {
    class R {
      async initialize() {}
      async run() {
        return 1;
      }
    }
    const ex = new InProcessInferenceExecutor({ m: '/x.js' }, async () => ({ default: { default: R } }));
    expect(await ex.doInference('m', null)).toBe(1);
  });

  it('still rejects methods nobody registered', async () => {
    const ex = new InProcessInferenceExecutor({}, async () => ({}));
    await expect(ex.doInference('nope', null)).rejects.toThrow(/No inference runner registered/);
  });

  it('retries a runner whose first load failed', async () => {
    let calls = 0;
    class R {
      async initialize() {
        if (calls++ === 0) throw new Error('weights missing');
      }
      async run() {
        return 'ok';
      }
    }
    const ex = new InProcessInferenceExecutor({ m: '/x.js' }, async () => ({ default: R }));
    await expect(ex.doInference('m', null)).rejects.toThrow('weights missing');
    expect(await ex.doInference('m', null)).toBe('ok');
  });
});
