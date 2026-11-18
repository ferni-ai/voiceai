/**
 * A handoff to a consented clone (Seth's, a legend's) resolves its voice, but its
 * id never reaches a log line: the resolver logs a marker in its place. The voice
 * ids here are invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged: unknown[] = [];
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record = (...args: unknown[]): void => void logged.push(args);
  const logger = { info: record, debug: record, warn: record, error: record, trace: record };
  return { ...real, getLogger: () => logger, createLogger: () => logger };
});

const { resolveVoiceId } = await import('../voice-id-resolver.js');

afterEach(() => {
  vi.unstubAllEnvs();
  logged.length = 0;
});

describe('resolveVoiceId logging', () => {
  it("never logs Seth's clone id on a handoff to him", () => {
    vi.stubEnv('SETH_TEAMMATE', 'on');
    vi.stubEnv('ROSTER_VOICE_SETH', 'fake-seth-id');
    for (const logLevel of ['info', 'debug'] as const) {
      expect(resolveVoiceId({ personaId: 'seth' }, { logLevel })).toMatchObject({
        voiceId: 'fake-seth-id',
      });
    }
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain('fake-seth-id');
    expect(JSON.stringify(logged)).toContain('[consented-clone]');
  });

  it('never logs a clone id handed in on the event, and still logs an ordinary one', () => {
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', 'fake-legend-id');
    resolveVoiceId({ voiceId: 'fake-legend-id', personaId: 'john-bogle' }, { logLevel: 'info' });
    expect(JSON.stringify(logged)).not.toContain('fake-legend-id');
    resolveVoiceId({ voiceId: 'fake-maya-id', personaId: 'maya-santos' }, { logLevel: 'info' });
    expect(JSON.stringify(logged)).toContain('fake-maya-id');
  });
});
