/**
 * A session whose backchannels play as clips keeps the older spoken "yep" path quiet,
 * so a caller never hears both a few seconds apart. startTurnSounds marks the session
 * when the clip player starts and unmarks it on cleanup.
 */
import { describe, expect, it, vi } from 'vitest';

const fakeClips = {
  playClip: () => true,
  lastPlayedAt: () => 0,
  cancelFresh: () => false,
  wireDelayMs: () => 60,
  openerClip: () => true,
  live: { playClip: () => true, cancelClip: () => false },
  close: async () => {},
};
const clipPlayer = vi.hoisted(() => ({ started: true }));
vi.mock('../../../agents/integrations/clip-player.js', () => ({
  startBackchannelClips: async () => (clipPlayer.started ? fakeClips : null),
}));
vi.mock('../../../agents/shared/conversational-audio-cache.js', () => ({
  getCachedAudioForPersona: () => null,
}));
vi.mock('../../../agents/integrations/turn-opening-sound.js', () => ({
  attachTurnOpeningSound: () => () => {},
  earlyOpeningWaitMs: () => null,
  turnOpeningSoundEnabled: () => false,
}));

const { usesClips } = await import('../clip-mode.js');
const { startTurnSounds } = await import('../../../agents/multi-agent/live-call-behaviors.js');

function start(sessionId: string, cleanupFunctions: Array<() => void>) {
  return startTurnSounds({
    room: {} as never,
    session: { on: () => {}, off: () => {} } as never,
    sessionId,
    personaId: () => 'ferni',
    lastUserFinalTranscript: () => '',
    cleanupFunctions,
  });
}

describe('clip backchannels silence the spoken path', () => {
  it('marks the session while its clips play, and unmarks it on cleanup', async () => {
    clipPlayer.started = true;
    const cleanup: Array<() => void> = [];
    expect(usesClips('s1')).toBe(false);
    await start('s1', cleanup);
    expect(usesClips('s1')).toBe(true);
    expect(usesClips('s2')).toBe(false);
    cleanup.forEach((fn) => fn());
    expect(usesClips('s1')).toBe(false);
  });

  it('leaves the spoken path on when the clip player could not start', async () => {
    clipPlayer.started = false;
    await start('s3', []);
    expect(usesClips('s3')).toBe(false);
  });
});
