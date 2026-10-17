/**
 * Earcon player: with the sound director on, the call's three earcons play
 * through one WebAudio master gain (iOS ignores <audio>.volume), from decoded
 * loudness-normalized buffers, and the handoff in the persona's own chime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeNode {
  kind: string;
  gain: {
    value: number;
    setValueAtTime: unknown;
    linearRampToValueAtTime: unknown;
    exponentialRampToValueAtTime: unknown;
  };
  connected: FakeNode[];
  buffer?: unknown;
  started: number;
  connect(node: FakeNode): void;
  start(): void;
}

const made = { contexts: 0, oscillators: 0, sources: [] as FakeNode[], gains: [] as FakeNode[] };

function node(kind: string): FakeNode {
  return {
    kind,
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connected: [],
    started: 0,
    connect(target) {
      this.connected.push(target);
    },
    start() {
      this.started += 1;
    },
  };
}

class FakeAudioContext {
  state = 'running';
  destination = node('destination');
  constructor() {
    made.contexts += 1;
  }
  resume = vi.fn(async () => {});
  createGain() {
    const gain = node('gain');
    made.gains.push(gain);
    return gain;
  }
  createOscillator() {
    made.oscillators += 1;
    return { ...node('oscillator'), type: 'sine', frequency: { value: 0 }, stop: vi.fn() };
  }
  createBufferSource() {
    const source = node('source');
    made.sources.push(source);
    return source;
  }
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => ({ decodedFrom: data }));
}

const procedural = vi.hoisted(() => ({
  routedTo: null as unknown,
  handoffs: [] as string[],
}));
vi.mock('../../../src/services/procedural-sounds.service.js', () => ({
  proceduralSounds: {
    isAvailable: () => true,
    initialize: async () => true,
    resume: async () => {},
    routeTo: (_ctx: unknown, output: unknown) => {
      procedural.routedTo = output;
    },
    playHandoffSound: async (personaId: string) => {
      procedural.handoffs.push(personaId);
    },
  },
  playProceduralSound: async () => {},
}));

const fetched: string[] = [];
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.resetModules();
  made.contexts = 0;
  made.oscillators = 0;
  made.sources = [];
  made.gains = [];
  procedural.routedTo = null;
  procedural.handoffs = [];
  fetched.length = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const turnOn = () => localStorage.setItem('ferni:sound-director', 'true');

async function app() {
  const director = await import('../../../src/services/sound-director.js');
  director.installSoundDirector({
    getRoom: () => null,
    onConnectionState: () => {},
  });
  return director;
}

describe('earcon output, flag on', () => {
  it('starts on the first tap and loads the two normalized files', async () => {
    turnOn();
    await app();
    document.dispatchEvent(new Event('touchend'));
    await flush();
    expect(made.contexts).toBe(1);
    expect(fetched).toEqual(['/sounds/earcons/arrival.mp3', '/sounds/earcons/goodbye.mp3']);

    document.dispatchEvent(new Event('click')); // later taps reuse the same output
    expect(made.contexts).toBe(1);
  });

  it('plays arrival and goodbye from decoded buffers into the one master gain, never <audio>', async () => {
    turnOn();
    const audioPlays: string[] = [];
    vi.stubGlobal(
      'Audio',
      class CountingAudio {
        volume = 1;
        preload = '';
        constructor(public src = '') {}
        cloneNode() {
          return new CountingAudio(this.src);
        }
        play() {
          audioPlays.push(this.src);
          return Promise.resolve();
        }
      }
    );
    const { soundUI } = await import('../../../src/ui/sound.ui.js');
    soundUI.init(); // its own MP3s (whose volume iOS ignores) and synth are live
    await app();
    document.dispatchEvent(new Event('click'));

    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(1_000_000);
    soundUI.play('enter', 'arrival');
    await flush();
    vi.setSystemTime(1_060_000);
    soundUI.play('goodbye', 'goodbye');
    await flush();
    vi.runAllTimers();
    vi.useRealTimers();

    expect(audioPlays).toEqual([]);
    expect(made.oscillators).toBe(0);
    expect(made.sources).toHaveLength(2);
    const master = made.sources[0]?.connected[0];
    expect(master?.gain.value).toBe(0.9);
    expect(master?.connected.map((n) => n.kind)).toEqual(['destination']);
    for (const source of made.sources) {
      expect(source.started).toBe(1);
      expect(source.connected).toEqual([master]);
      expect(source.buffer).toBeTruthy();
    }
  });

  it("plays the handoff as the new persona's chime, trimmed, through the same master", async () => {
    turnOn();
    const { audioService } = await import('../../../src/services/audio.service.js');
    const { HANDOFF_TRIM_DB } = await import('../../../src/services/earcon-player.js');
    await app();
    document.dispatchEvent(new Event('click'));

    await audioService.playHandoffSound('dramatic-entrance', 0, 'maya');
    await flush();

    expect(procedural.handoffs).toEqual(['maya']);
    const [master, handoff] = made.gains;
    expect(procedural.routedTo).toBe(handoff);
    expect(handoff?.connected).toEqual([master]);
    expect(handoff?.gain.value).toBeCloseTo(Math.pow(10, (HANDOFF_TRIM_DB.maya ?? 0) / 20));
  });
});

describe('earcon output, flag off', () => {
  it('never starts an audio context of its own', async () => {
    await app();
    document.dispatchEvent(new Event('touchend'));
    document.dispatchEvent(new Event('click'));
    await flush();
    expect(made.contexts).toBe(0);
    expect(fetched).toEqual([]);
  });
});
