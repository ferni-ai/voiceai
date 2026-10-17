/**
 * Sound director: the gate every web sound engine asks before it plays.
 *
 * The scripted call below is the order of sound requests the app makes in one
 * call (file refs per step). Flag off, every request passes, so what plays is
 * unchanged. Flag on, the same call is exactly arrival, handoff, goodbye.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Earcon, SoundEngine, SpeechRoom } from '../../../src/services/sound-director.js';

type Director = typeof import('../../../src/services/sound-director.js');

type Step =
  | { at: number; engine: SoundEngine; name: string; earcon?: Earcon }
  | { at: number; connection: string }
  | { at: number; dropped: true }
  | { at: number; speaking: 'agent' | 'user' | 'nobody' };

const S = 1000;

/** One call: tap, Ferni joins, two aha moments, a handoff, a reconnect, the goodbye. */
const SCRIPTED_CALL: Step[] = [
  { at: 0, connection: 'connecting' }, // connect(): connection.service updateState
  { at: 0, engine: 'ui', name: 'connect' }, // app.ts connect(): tap Call
  { at: 3 * S, connection: 'connected' },
  { at: 3 * S, engine: 'ui', name: 'enter', earcon: 'arrival' }, // app.ts onAgentConnected
  { at: 3 * S, engine: 'brand', name: 'system.connectionSuccess' }, // ritual connection_start
  { at: 4 * S, speaking: 'agent' }, // Ferni's greeting
  { at: 40 * S, engine: 'ui', name: 'success' }, // aha #1 (data-message-handlers)
  { at: 41 * S, engine: 'brand', name: 'celebration.small' }, // ritual small_win
  { at: 60 * S, engine: 'ui', name: 'success' }, // aha #2
  { at: 62 * S, speaking: 'nobody' },
  { at: 90 * S, engine: 'ui', name: 'switch' }, // tap a teammate (app.ts)
  { at: 91 * S, engine: 'effects', name: 'dramatic-entrance', earcon: 'handoff' }, // handoff.service playHandoffSound
  { at: 91 * S, engine: 'brand', name: 'handoff.toJack' }, // ritual persona_handoff
  { at: 91 * S, engine: 'magic', name: 'handoff-to-jack' }, // persona-magic
  { at: 92 * S, engine: 'ui', name: 'switch' }, // app.ts after the handoff
  { at: 150 * S, connection: 'reconnecting' }, // network blip
  { at: 152 * S, connection: 'connected' },
  { at: 153 * S, engine: 'ui', name: 'enter', earcon: 'arrival' }, // the agent rejoins: onAgentConnected again
  { at: 153 * S, engine: 'brand', name: 'system.connectionSuccess' },
  { at: 300 * S, engine: 'ui', name: 'goodbye', earcon: 'goodbye' }, // goodbye ceremony
  { at: 302 * S, engine: 'ui', name: 'hangup', earcon: 'goodbye' }, // ceremony receiver click
  { at: 302 * S, connection: 'disconnected' },
  { at: 302 * S, engine: 'brand', name: 'system.sessionEnd' }, // ritual connection_end
];

const room: { agent: string; user: boolean } = { agent: 'listening', user: false };
const fakeRoom = (): SpeechRoom => ({
  localParticipant: { isSpeaking: room.user },
  remoteParticipants: new Map([['agent', { attributes: { 'lk.agent.state': room.agent } }]]),
});

let connectionListener: (state: string) => void = () => {};

async function freshDirector(): Promise<Director> {
  vi.resetModules();
  const director = await import('../../../src/services/sound-director.js');
  director.installSoundDirector({
    getRoom: fakeRoom,
    onConnectionState: (callback) => {
      connectionListener = callback;
    },
  });
  return director;
}

function run(director: Director, steps: Step[]): string[] {
  const played: string[] = [];
  for (const step of steps) {
    vi.setSystemTime(step.at);
    if ('connection' in step) connectionListener(step.connection);
    else if ('dropped' in step) director.noteCallDropped();
    else if ('speaking' in step) {
      room.agent = step.speaking === 'agent' ? 'speaking' : 'listening';
      room.user = step.speaking === 'user';
    } else if (director.soundGate(step.engine, step.name, step.earcon)) {
      played.push(step.earcon ?? step.name);
    }
  }
  return played;
}

const soundSteps = (steps: Step[]) =>
  steps.flatMap((s) => ('engine' in s ? [s.earcon ?? s.name] : []));

beforeEach(() => {
  vi.useFakeTimers();
  room.agent = 'listening';
  room.user = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const turnOn = () => localStorage.setItem('ferni:sound-director', 'true');

describe('sound director, flag off', () => {
  it('lets every request of the scripted call through, so what plays is unchanged', async () => {
    const director = await freshDirector();
    expect(run(director, SCRIPTED_CALL)).toEqual(soundSteps(SCRIPTED_CALL));
  });

  it('ignores the saved Sound setting', async () => {
    localStorage.setItem('ferni:sound', 'off');
    const director = await freshDirector();
    expect(director.soundGate('ui', 'click')).toBe(true);
  });
});

describe('sound director, flag on', () => {
  it('turns the scripted call into exactly arrival, handoff, goodbye', async () => {
    turnOn();
    const director = await freshDirector();
    expect(run(director, SCRIPTED_CALL)).toEqual(['arrival', 'handoff', 'goodbye']);
  });

  it('turns on for a build with VITE_SOUND_DIRECTOR', async () => {
    vi.stubEnv('VITE_SOUND_DIRECTOR', 'true');
    const director = await freshDirector();
    expect(director.soundGate('ui', 'click')).toBe(false);
  });

  it('plays nothing while Ferni or the caller is speaking', async () => {
    turnOn();
    const director = await freshDirector();
    const played = run(director, [
      { at: 0, connection: 'connecting' },
      { at: 3 * S, speaking: 'agent' },
      { at: 3 * S, engine: 'ui', name: 'enter', earcon: 'arrival' },
      { at: 30 * S, speaking: 'user' },
      { at: 30 * S, engine: 'effects', name: 'handoff-to-jack', earcon: 'handoff' },
      { at: 60 * S, speaking: 'nobody' },
      { at: 60 * S, engine: 'effects', name: 'handoff-to-maya', earcon: 'handoff' },
      // A rejoin never plays the arrival the greeting held back.
      { at: 90 * S, engine: 'ui', name: 'enter', earcon: 'arrival' },
    ]);
    expect(played).toEqual(['handoff']);
  });

  it('keeps 20 s between earcons and at most four per call', async () => {
    turnOn();
    const director = await freshDirector();
    const handoffs: Step[] = [0, 10, 25, 50, 75, 100, 125].map((sec) => ({
      at: 100 * S + sec * S,
      engine: 'effects',
      name: `handoff-at-${sec}`,
      earcon: 'handoff',
    }));
    const played = run(director, [{ at: 0, connection: 'connecting' }, ...handoffs]);
    // 10 s is too soon; after four earcons the call is out of budget.
    expect(played).toHaveLength(director.MAX_EARCONS_PER_CALL);
    expect(director.MIN_EARCON_GAP_MS).toBe(20 * S);
  });

  it('is silent on a drop, and a quick retry is the same call coming back', async () => {
    turnOn();
    const director = await freshDirector();
    const played = run(director, [
      { at: 0, connection: 'connecting' },
      { at: 3 * S, engine: 'ui', name: 'enter', earcon: 'arrival' },
      { at: 60 * S, dropped: true },
      { at: 60 * S, engine: 'ui', name: 'disconnect', earcon: 'goodbye' },
      { at: 60 * S, connection: 'disconnected' },
      { at: 70 * S, connection: 'connecting' }, // Retry within the rejoin window
      { at: 95 * S, engine: 'ui', name: 'enter', earcon: 'arrival' },
      { at: 200 * S, engine: 'ui', name: 'goodbye', earcon: 'goodbye' },
    ]);
    expect(played).toEqual(['arrival', 'goodbye']);
  });

  it('starts a fresh call after the rejoin window', async () => {
    turnOn();
    const director = await freshDirector();
    const played = run(director, [
      { at: 0, connection: 'connecting' },
      { at: 3 * S, engine: 'ui', name: 'enter', earcon: 'arrival' },
      { at: 60 * S, dropped: true },
      { at: 60 * S, connection: 'disconnected' },
      { at: 60 * S + director.REJOIN_WINDOW_MS, connection: 'connecting' },
      { at: 65 * S + director.REJOIN_WINDOW_MS, engine: 'ui', name: 'enter', earcon: 'arrival' },
    ]);
    expect(played).toEqual(['arrival', 'arrival']);
  });

  it('plays nothing at all when the saved Sound setting is off', async () => {
    turnOn();
    localStorage.setItem('ferni:sound', 'off');
    const director = await freshDirector();
    expect(director.soundGate('ui', 'enter', 'arrival')).toBe(false);
  });
});

describe('the Sound setting (sound.ui mute)', () => {
  it('flag on: muting persists across a reload and silences every engine', async () => {
    turnOn();
    await freshDirector();
    const { soundUI } = await import('../../../src/ui/sound.ui.js');
    soundUI.setMuted(true);

    const director = await freshDirector(); // a reload: fresh modules, same storage
    const reloaded = (await import('../../../src/ui/sound.ui.js')).soundUI;
    expect(reloaded.getMuted()).toBe(true);
    expect(director.soundGate('effects', 'dramatic-entrance', 'handoff')).toBe(false);
    expect(director.soundGate('brand', 'system.connectionSuccess')).toBe(false);

    expect(reloaded.toggleMute()).toBe(false);
    expect(director.soundGate('ui', 'enter', 'arrival')).toBe(true);
  });

  it('flag off: mute stays in memory only, as before', async () => {
    await freshDirector();
    const { soundUI } = await import('../../../src/ui/sound.ui.js');
    expect(soundUI.toggleMute()).toBe(true);
    expect(localStorage.getItem('ferni:sound')).toBeNull();

    await freshDirector();
    expect((await import('../../../src/ui/sound.ui.js')).soundUI.getMuted()).toBe(false);
  });
});

describe('roomHasSpeech', () => {
  it('reads lk.agent.state and the caller as active speaker', async () => {
    const { roomHasSpeech } = await freshDirector();
    const agent = (state: string) => new Map([['a', { attributes: { 'lk.agent.state': state } }]]);
    expect(roomHasSpeech(null)).toBe(false);
    expect(roomHasSpeech({ remoteParticipants: agent('listening') })).toBe(false);
    expect(roomHasSpeech({ remoteParticipants: agent('thinking') })).toBe(false);
    expect(roomHasSpeech({ remoteParticipants: agent('speaking') })).toBe(true);
    expect(
      roomHasSpeech({ localParticipant: { isSpeaking: true }, remoteParticipants: new Map() })
    ).toBe(true);
  });
});
