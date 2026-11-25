/**
 * A handoff to a consented clone (Seth's, a legend's) resolves its voice, but its
 * id never reaches a log line: the resolver logs what it found, and the logger
 * replaces a registered clone id in the written line (redacted-log-values.ts), once
 * the roster is loaded as every deployed entry does at boot. The voice ids here are
 * invented.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The real logger: its line redaction is what keeps the id out.
vi.unmock('../../../utils/safe-logger.js');

const { resolveVoiceId } = await import('../voice-id-resolver.js');

beforeAll(async () => {
  await import('../../../personas/roster/index.js'); // what every entry does at boot
});

// The registered values are read again once a second: each test starts two seconds
// later, so it sees the env it stubs.
let clock = Date.now();
function tick(): void {
  clock += 2000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Runs `fn` and returns everything the logger wrote meanwhile. */
function written(fn: () => void): string {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join('');
}

describe('resolveVoiceId logging', () => {
  it("never logs Seth's clone id on a handoff to him", () => {
    vi.stubEnv('SETH_TEAMMATE', 'on');
    vi.stubEnv('ROSTER_VOICE_SETH', 'fake-seth-id');
    vi.stubEnv('LOG_LEVEL', 'debug');
    tick();
    const out = written(() => {
      for (const logLevel of ['info', 'debug'] as const) {
        expect(resolveVoiceId({ personaId: 'seth' }, { logLevel })).toMatchObject({
          voiceId: 'fake-seth-id',
        });
      }
    });
    expect(out).toContain('Voice ID found from');
    expect(out).not.toContain('fake-seth-id');
    expect(out).toContain('[consented-clone]');
  });

  it('never logs a clone id handed in on the event, and still logs an ordinary one', () => {
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', 'fake-legend-id');
    tick();
    const out = written(() => {
      resolveVoiceId({ voiceId: 'fake-legend-id', personaId: 'john-bogle' }, { logLevel: 'info' });
      resolveVoiceId({ voiceId: 'fake-maya-id', personaId: 'maya-santos' }, { logLevel: 'info' });
    });
    expect(out).not.toContain('fake-legend-id');
    expect(out).toContain('[consented-clone]');
    expect(out).toContain('fake-maya-id');
  });
});
