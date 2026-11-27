/**
 * A say that fails through the coordinator logs the failure's class, never its message: a TTS or
 * session error can echo the line being said (#4446). Fictional sentence only.
 */
import type { voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sink = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const record = (...args: unknown[]) => void calls.push(args);
  const logger: Record<string, unknown> = {
    debug: record,
    info: record,
    warn: record,
    error: record,
  };
  logger.child = () => logger;
  return { calls, logger };
});
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => sink.logger,
}));

const coordinator = vi.hoisted(() => ({
  attachSession: vi.fn(),
  detachSession: vi.fn(),
  requestSpeak: vi.fn(),
}));
vi.mock('../speech-coordinator.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../speech-coordinator.js')>()),
  getSpeechCoordinator: () => coordinator,
}));

import {
  cleanupSpeechCoordination,
  coordinatedSay,
  initializeSpeechCoordination,
} from '../session-integration.js';

const SENTENCE = 'zorbleflax tell my fictional neighbour the ladder is back';

afterEach(() => {
  cleanupSpeechCoordination('s-log-1');
  sink.calls.length = 0;
  coordinator.requestSpeak.mockReset();
});

describe('coordinatedSay', () => {
  it('logs the class of a failed say, not the text its error quotes', async () => {
    initializeSpeechCoordination({
      session: {} as unknown as voice.AgentSession,
      sessionId: 's-log-1',
      personaId: 'ferni',
      userId: 'user-fic1',
    });
    coordinator.requestSpeak.mockImplementation(() => {
      throw new Error(`TTS rejected: ${SENTENCE}`);
    });

    coordinatedSay('s-log-1', SENTENCE);
    await vi.waitFor(() =>
      expect(sink.calls.some((c) => c[1] === 'Coordinated say failed')).toBe(true)
    );

    const line = sink.calls.find((c) => c[1] === 'Coordinated say failed');
    expect(line?.[0]).toEqual({ sessionId: 's-log-1', error: 'Error' });
    expect(JSON.stringify(sink.calls)).not.toContain('zorbleflax');
  });
});
