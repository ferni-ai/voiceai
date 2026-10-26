/**
 * The real safe-logger (the global test setup mocks it) never throws into its
 * caller: inside a request a throwing log line turned the reply into a 500,
 * an SMS's 988 or STOP confirmation among them (#2913).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, safeLog } from '../safe-logger.js';

vi.unmock('../safe-logger.js');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a log call never throws into its caller', () => {
  it('fields whose getter throws (even a value with no string form) are dropped, not thrown', () => {
    const fields = {
      get boom(): unknown {
        throw Object.create(null);
      },
    };
    const loggers = [
      safeLog(),
      createLogger({ module: 'x' }),
      createLogger({ module: 'x' }).child({ a: 1 }),
    ];
    for (const logger of loggers) {
      for (const level of ['debug', 'info', 'warn', 'error'] as const) {
        expect(() => logger[level](fields, 'm')).not.toThrow();
      }
    }
  });

  it('a write that throws (a closed stderr) is dropped, not thrown', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    const logger = createLogger({ module: 'x' });
    for (const level of ['info', 'warn', 'error'] as const) {
      expect(() => logger[level]({ a: 1 }, 'm')).not.toThrow();
    }
    expect(write).toHaveBeenCalled();
  });
});
