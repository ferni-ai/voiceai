/**
 * The clip player's presence sounds (whistle, hum, snore) stay quiet once the
 * call's goodbyes are said (CALL_WRAP_UP, call-farewell.ts).
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const played = vi.hoisted(() => ({ count: 0 }));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      played.count++;
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});

const { voice } = await import('@livekit/agents');
const { startBackchannelClips } = await import('../clip-player.js');
const { clearFarewell, watchFarewell } = await import('../../shared/call-farewell.js');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Presence sounds played in an easy silence after three exchanges. */
async function soundsInSilence(goodbyesSaid: boolean): Promise<number> {
  vi.stubEnv('PRESENCE_SOUNDS', 'on');
  vi.stubEnv('CALL_WRAP_UP', 'on');
  vi.stubEnv('REACTION_SIDETRACK', 'off');
  const sessionId = `presence-quiet-${String(goodbyesSaid)}`;
  // The watcher keeps Math.random as its dice when created: fix it before then.
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const session = Object.assign(new EventEmitter(), { userData: {} });
  const stop = watchFarewell(session, { sessionId, onIdle: () => undefined });
  const agent = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: s });
  const clips = await startBackchannelClips(
    {} as never,
    session as never,
    () => 'ferni',
    () => null
  );
  if (!clips) throw new Error('clip player did not start');
  vi.useFakeTimers();
  for (let i = 0; i < 3; i++) {
    agent('speaking');
    agent('listening');
  }
  if (goodbyesSaid) {
    const say = (role: string, text: string) =>
      session.emit(voice.AgentSessionEventTypes.ConversationItemAdded, {
        item: { type: 'message', role, textContent: text },
      });
    say('user', 'alright, talk soon');
    say('assistant', 'Talk soon, take care.');
  }
  const before = played.count;
  vi.advanceTimersByTime(30_000);
  const sounds = played.count - before;
  vi.useRealTimers();
  stop();
  clearFarewell(sessionId);
  await clips.close();
  return sounds;
}

describe('presence sounds after the goodbyes', () => {
  it('whistles in an ordinary easy silence, but not once the goodbyes are said', async () => {
    expect(await soundsInSilence(false)).toBe(1);
    expect(await soundsInSilence(true)).toBe(0);
  });
});
