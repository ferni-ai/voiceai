/**
 * Pipeline Tests
 *
 * Tests for the composable pipeline pattern.
 *
 * @module agents/__tests__/core/pipeline
 */

import { describe, expect, it, vi } from 'vitest';
import { PipelineStepError } from '../../core/errors.js';
import { Pipeline, createStep, type PipelineStep } from '../../core/pipeline.js';
import { err, ok } from '../../core/result.js';
import type { Logger } from '../../core/types.js';

// Mock logger
const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('Pipeline', () => {
  describe('basic execution', () => {
    it('should execute steps in sequence', async () => {
      const logger = createMockLogger();
      const order: number[] = [];

      const pipeline = new Pipeline<{ value: number }>('test')
        .add(
          createStep('step1', async (ctx) => {
            order.push(1);
            return ok({ value: ctx.value + 1 });
          })
        )
        .add(
          createStep('step2', async (ctx) => {
            order.push(2);
            return ok({ value: ctx.value * 2 });
          })
        );

      const result = await pipeline.execute({ value: 5 }, logger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe(12); // (5 + 1) * 2
      }
      expect(order).toEqual([1, 2]);
    });

    it('should stop on first error', async () => {
      const logger = createMockLogger();
      const order: number[] = [];

      const pipeline = new Pipeline<{ value: number }>('test')
        .add(
          createStep('step1', async (ctx) => {
            order.push(1);
            return ok({ value: ctx.value + 1 });
          })
        )
        .add(
          createStep('failing', async () => {
            order.push(2);
            return err(new PipelineStepError('failing', 1, 'intentional failure'));
          })
        )
        .add(
          createStep('step3', async (ctx) => {
            order.push(3);
            return ok({ value: ctx.value + 100 });
          })
        );

      const result = await pipeline.execute({ value: 5 }, logger);

      expect(result.ok).toBe(false);
      expect(order).toEqual([1, 2]); // Step 3 should not run
    });
  });

  describe('optional steps', () => {
    it('should continue past optional step failures', async () => {
      const logger = createMockLogger();

      const pipeline = new Pipeline<{ value: number }>('test')
        .add(createStep('step1', async (ctx) => ok({ value: ctx.value + 1 })))
        .add(
          createStep('optional-failing', async () =>
            err(new PipelineStepError('optional', 1, 'optional failure'))
          ),
          { optional: true }
        )
        .add(createStep('step3', async (ctx) => ok({ value: ctx.value * 2 })));

      const result = await pipeline.execute({ value: 5 }, logger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should continue with original context after optional failure
        expect(result.value.value).toBe(12); // (5 + 1) * 2
      }
    });
  });

  describe('step skipping', () => {
    it('should skip steps when shouldSkip returns true', async () => {
      const logger = createMockLogger();
      const executed: string[] = [];

      const skipStep: PipelineStep<{ skip: boolean }> = {
        name: 'conditional',
        shouldSkip: (ctx) => ctx.skip,
        execute: async (ctx) => {
          executed.push('conditional');
          return ok(ctx);
        },
      };

      const pipeline = new Pipeline<{ skip: boolean }>('test')
        .add({
          name: 'always',
          execute: async (ctx) => {
            executed.push('always');
            return ok(ctx);
          },
        })
        .add(skipStep);

      // With skip = true
      const result1 = await pipeline.execute({ skip: true }, logger);
      expect(result1.ok).toBe(true);
      expect(executed).toEqual(['always']);

      // Reset and test with skip = false
      executed.length = 0;
      const result2 = await pipeline.execute({ skip: false }, logger);
      expect(result2.ok).toBe(true);
      expect(executed).toEqual(['always', 'conditional']);
    });
  });

  describe('timeout', () => {
    it('should timeout slow steps', async () => {
      const logger = createMockLogger();

      const pipeline = new Pipeline<Record<string, unknown>>('test').add(
        createStep('slow', async () => {
          await new Promise<void>((r) => {
            setTimeout(r, 1000);
          });
          return ok({});
        }),
        { timeoutMs: 50 }
      );

      const result = await pipeline.execute({}, logger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('timed out');
      }
    });
  });

  describe('retry', () => {
    it('should retry failed steps', async () => {
      const logger = createMockLogger();
      let attempts = 0;

      const pipeline = new Pipeline<Record<string, unknown>>('test').add(
        createStep('flaky', async () => {
          attempts++;
          if (attempts < 3) {
            return err(new PipelineStepError('flaky', 0, `attempt ${attempts}`));
          }
          return ok({});
        }),
        { retry: { maxAttempts: 3, delayMs: 10 } }
      );

      const result = await pipeline.execute({}, logger);

      expect(result.ok).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const logger = createMockLogger();
      let attempts = 0;

      const pipeline = new Pipeline<Record<string, unknown>>('test').add(
        createStep('always-fail', async () => {
          attempts++;
          return err(new PipelineStepError('always-fail', 0, 'nope'));
        }),
        { retry: { maxAttempts: 3, delayMs: 10 } }
      );

      const result = await pipeline.execute({}, logger);

      expect(result.ok).toBe(false);
      expect(attempts).toBe(3);
    });
  });

  describe('getStepNames', () => {
    it('should return step names for debugging', () => {
      const pipeline = new Pipeline<Record<string, unknown>>('test')
        .add(createStep('first', async (ctx) => ok(ctx)))
        .add(createStep('second', async (ctx) => ok(ctx)))
        .add(createStep('third', async (ctx) => ok(ctx)));

      expect(pipeline.getStepNames()).toEqual(['first', 'second', 'third']);
    });
  });
});
