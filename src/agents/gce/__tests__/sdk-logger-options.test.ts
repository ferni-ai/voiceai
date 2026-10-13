import { describe, expect, it } from 'vitest';
import { sdkLoggerOptions } from '../sdk-logger-options.js';

describe('sdkLoggerOptions', () => {
  it('writes JSON records when deployed', () => {
    expect(sdkLoggerOptions({ NODE_ENV: 'production' })).toEqual({ pretty: false, level: 'info' });
  });

  it('pretty-prints for local development', () => {
    expect(sdkLoggerOptions({ NODE_ENV: 'development' }).pretty).toBe(true);
    expect(sdkLoggerOptions({}).pretty).toBe(true);
  });

  it('takes the level from LOG_LEVEL', () => {
    expect(sdkLoggerOptions({ NODE_ENV: 'production', LOG_LEVEL: 'debug' }).level).toBe('debug');
  });
});
