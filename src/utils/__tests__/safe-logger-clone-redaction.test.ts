/**
 * The real safe-logger (the global test setup mocks it) never writes a registered value
 * (a consented clone's voice id, registered by personas/roster): not in a nested field, an
 * array, the message, a child's bindings, nor in another case or padded. Anything else is
 * written as it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { redactLogValues, registerRedactedLogValues } from '../redacted-log-values.js';
import { createLogger } from '../safe-logger.js';

vi.unmock('../safe-logger.js');

const CLONE = 'fake-seth-id';
const REDACTED_LOG_VALUE = '[consented-clone]';
let configured: string[] = [];
registerRedactedLogValues(() => configured);

// The values are read again once a second: each test starts a second later, so it sees its own.
let clock = Date.now();
beforeEach(() => {
  clock += 2000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  configured = [CLONE];
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function logged(write: (log: ReturnType<typeof createLogger>) => void): string {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  write(createLogger({ module: 'clone-redaction-test' }));
  vi.restoreAllMocks();
  return chunks.join('');
}

describe("safe-logger never writes a consented clone's voice id", () => {
  it.each<[string, (log: ReturnType<typeof createLogger>) => void]>([
    ['a nested field', (log) => log.info({ tts: { voice: { id: CLONE } } }, 'tts ready')],
    ['an array', (log) => log.info({ voices: ['fake-maya-id', CLONE] }, 'voices')],
    ['the message', (log) => log.warn(`switching to voice ${CLONE} now`)],
    ['the message after fields', (log) => log.info({ n: 1 }, `voice=${CLONE}`)],
    ['uppercase', (log) => log.info({ voiceId: CLONE.toUpperCase() }, 'tts ready')],
    ['padded', (log) => log.info({ voiceId: `  ${CLONE}\t` }, 'tts ready')],
    ['a child binding', (log) => log.child({ voiceId: CLONE }).info('bound')],
    ['an error-level line', (log) => log.error({ voiceId: CLONE }, 'tts failed')],
  ])('%s', (_where, write) => {
    const out = logged(write);
    expect(out).toContain(REDACTED_LOG_VALUE);
    expect(out.toLowerCase()).not.toContain(CLONE);
  });

  it('leaves an ordinary voice id, and an id that only starts with the clone, alone', () => {
    const out = logged((log) =>
      log.info({ voiceId: 'fake-maya-id', other: `${CLONE}-2`, word: `x${CLONE}` }, 'tts ready')
    );
    expect(out).toContain('"voiceId":"fake-maya-id"');
    expect(out).toContain(`"other":"${CLONE}-2"`);
    expect(out).toContain(`"word":"x${CLONE}"`);
    expect(out).not.toContain(REDACTED_LOG_VALUE);
  });

  it('with no clone configured nothing changes', () => {
    configured = [];
    const out = logged((log) => log.info({ voiceId: CLONE }, `voice ${CLONE}`));
    expect(out).toContain(`"voiceId":"${CLONE}"`);
    expect(out).not.toContain(REDACTED_LOG_VALUE);
  });

  it('reads the setting again each second, so a clone configured later is redacted from then on', () => {
    configured = [];
    expect(logged((log) => log.info({ voiceId: CLONE }, 'before'))).toContain(CLONE);
    configured = [CLONE];
    expect(logged((log) => log.info({ voiceId: CLONE }, 'same second'))).toContain(CLONE);
    clock += 1000;
    vi.setSystemTime(clock);
    expect(logged((log) => log.info({ voiceId: CLONE }, 'after'))).not.toContain(CLONE);
  });
});

describe('redactLogValues', () => {
  it('never registers a blank value, so an empty setting redacts nothing', () => {
    configured = ['', '   ', '\t'];
    expect(redactLogValues('{"msg":"anything at all"}')).toBe('{"msg":"anything at all"}');
  });

  it('treats a value as text, not as a pattern', () => {
    configured = ['a.c'];
    expect(redactLogValues('abc a.c')).toBe(`abc ${REDACTED_LOG_VALUE}`);
  });
});
