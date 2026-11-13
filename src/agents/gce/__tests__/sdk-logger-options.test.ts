import { loggerOptions } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { initializeSdkLogger } from '../sdk-logger-options.js';

/** The options the SDK logger was started with, as the SDK itself records them. */
function startedWith(env: Record<string, string>): unknown {
  initializeSdkLogger(env);
  return loggerOptions();
}

describe('initializeSdkLogger', () => {
  it('writes JSON records when deployed', () => {
    expect(startedWith({ NODE_ENV: 'production' })).toEqual({ pretty: false, level: 'info' });
  });

  it('pretty-prints for local development', () => {
    expect(startedWith({ NODE_ENV: 'development' })).toMatchObject({ pretty: true });
    expect(startedWith({})).toMatchObject({ pretty: true });
  });

  it('takes the level from LOG_LEVEL', () => {
    expect(startedWith({ NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toMatchObject({
      level: 'debug',
    });
  });
});
