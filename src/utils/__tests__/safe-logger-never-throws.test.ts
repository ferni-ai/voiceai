/**
 * The real safe-logger (the global test setup mocks it) never throws into its
 * caller: inside a request a throwing log line turned the reply into a 500,
 * an SMS's 988 or STOP confirmation among them (#2913).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  droppedLogLines,
  resetDroppedLogLinesForTests,
  safeLog,
  setErrorLogSink,
} from '../safe-logger.js';

vi.unmock('../safe-logger.js');

afterEach(() => {
  vi.restoreAllMocks();
  setErrorLogSink(null);
  resetDroppedLogLinesForTests();
});

const throwing = {
  get boom(): unknown {
    throw new TypeError('bad getter');
  },
};

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

  it('a dark logger is never silent: drops are counted and announced through the error sink at 1, 100, 10 000', () => {
    const sink = vi.fn();
    setErrorLogSink(sink);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = createLogger({ module: 'x' });
    for (let i = 0; i < 99; i++) logger.info(throwing, 'm');
    expect(droppedLogLines()).toBe(99);
    expect(sink).toHaveBeenCalledTimes(1);
    const [fields, message] = sink.mock.calls[0]?.[0] as [{ error: Error }, string];
    expect(message).toBe('Log lines are being dropped');
    expect(fields.error.message).toBe('safe-logger dropped 1 log line(s); last failure: TypeError');
    expect(JSON.stringify(sink.mock.calls)).not.toContain('boom');
    logger.info(throwing, 'm');
    expect(sink).toHaveBeenCalledTimes(2);
    expect((sink.mock.calls[1]?.[0] as [{ error: Error }])[0].error.message).toContain(
      'dropped 100 '
    );
  });

  it('a sink that throws too still never throws into the caller, and the count stays', () => {
    setErrorLogSink(() => {
      throw Object.create(null);
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    expect(() => createLogger({ module: 'x' }).warn(throwing, 'm')).not.toThrow();
    expect(droppedLogLines()).toBe(1);
  });
});
