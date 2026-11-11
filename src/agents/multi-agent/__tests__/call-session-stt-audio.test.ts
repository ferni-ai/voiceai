/**
 * STT_AUDIO_DIAGNOSTICS reaches the live call: createCallSession hands the
 * session it builds and the cascade STT to watchSessionSttAudio, which feeds
 * VAD bursts and SDK discards to the STT stream's watch.
 */
import { describe, expect, it, vi } from 'vitest';

const cascadeStt = vi.hoisted(() => ({ marker: 'cascade-stt' }));
const watchSessionSttAudio = vi.hoisted(() => vi.fn());

vi.mock('../../model-provider/index.js', () => ({
  createProviderSTT: () => cascadeStt,
  buildCascadeKeyterms: () => ['Ferni'],
  getModelProvider: () => ({ getSessionTurnDetection: () => 'stt', speaksNatively: () => false }),
}));
vi.mock('../../model-provider/stt-audio-diagnostics.js', () => ({ watchSessionSttAudio }));
vi.mock('../../shared/session-listener-limit.js', () => ({ limitSessionListeners: () => {} }));
vi.mock('../live-call-behaviors.js', () => ({ logBargeInDecisions: () => {} }));

const { createCallSession } = await import('../call-session.js');

describe('createCallSession STT audio diagnostics', () => {
  it('passes the built session and its cascade STT to watchSessionSttAudio', async () => {
    process.env.DISABLE_VAD = 'true';
    const session = await createCallSession({
      persona: { id: 'ferni' } as never,
      sessionId: 's1',
      services: {} as never,
      userData: {} as never,
      llmModel: {},
      tts: {} as never,
    });
    expect(watchSessionSttAudio).toHaveBeenCalledTimes(1);
    expect(watchSessionSttAudio).toHaveBeenCalledWith(session, cascadeStt);
  });
});
