/**
 * Dynamic Domain Executor Init Tests
 *
 * Pins that concurrent first callers share one domain import pass. Startup
 * warmup and a live tool call can both reach the cold init, and the second
 * must wait for the first rather than run the loop again.
 *
 * @module agents/shared/tool-executors/__tests__/dynamic-domain-executor-init.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logInfo } = vi.hoisted(() => ({ logInfo: vi.fn() }));

// Spy on the executor's own logger only; domain modules keep the real one
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (opts: Parameters<typeof actual.createLogger>[0]) => {
      const real = actual.createLogger(opts);
      if (typeof opts !== 'object' || opts?.module !== 'DynamicDomainExecutor') return real;
      return new Proxy(real, {
        get: (target, prop, receiver) =>
          prop === 'info' ? logInfo : Reflect.get(target, prop, receiver),
      });
    },
  };
});

const { isDynamicTool, resetDynamicExecutor } = await import('../dynamic-domain-executor.js');

// Importing ~47 domain modules cold takes a while
const LOAD_TIMEOUT_MS = 120_000;

/** One per completed import pass over DOMAIN_MODULES. */
function importPasses(): number {
  return logInfo.mock.calls.filter(([, msg]) => String(msg).includes('executor initialized'))
    .length;
}

describe('dynamicDomainExecutor init', () => {
  beforeEach(() => {
    resetDynamicExecutor();
    logInfo.mockClear();
  });

  it(
    'runs the domain import pass once for concurrent first callers',
    async () => {
      const results = await Promise.all([
        isDynamicTool('assessCareerSatisfaction'),
        isDynamicTool('assessCareerSatisfaction'),
        isDynamicTool('processGrief'),
      ]);

      expect(results).toEqual([true, true, true]);
      expect(importPasses()).toBe(1);
    },
    LOAD_TIMEOUT_MS
  );

  it(
    'runs a fresh pass after a reset',
    async () => {
      await isDynamicTool('processGrief');
      resetDynamicExecutor();
      expect(await isDynamicTool('processGrief')).toBe(true);

      expect(importPasses()).toBe(2);
    },
    LOAD_TIMEOUT_MS
  );
});
