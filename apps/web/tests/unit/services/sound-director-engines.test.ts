/**
 * Every sound engine asks the sound director before it plays.
 *
 * For each engine: flag off, its sounds reach the speaker as before; flag on,
 * the engine itself plays nothing, and the call's earcons go to the
 * director's one earcon output instead (earcon-player.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nodes = { oscillators: 0, bufferSources: 0 };

function param() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createGain() {
    return { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
  }
  createOscillator() {
    nodes.oscillators += 1;
    return { type: 'sine', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }
  createBufferSource() {
    nodes.bufferSources += 1;
    return {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
  }
  decodeAudioData = vi.fn(async () => ({ duration: 0.5 }));
}

const earcons = vi.hoisted(() => [] as string[]);
vi.mock('../../../src/services/earcon-player.js', () => ({
  installEarconUnlock: () => {},
  playEarcon: async (earcon: string, personaId?: string) => {
    earcons.push(personaId ? `${earcon}:${personaId}` : earcon);
  },
}));

const proceduralPlays = vi.hoisted(() => ({ effects: [] as string[] }));
vi.mock('../../../src/services/procedural-sounds.service.js', () => ({
  proceduralSounds: {
    isAvailable: () => true,
    initialize: async () => true,
    resume: async () => {},
  },
  playProceduralSound: async (effect: string) => {
    proceduralPlays.effects.push(effect);
  },
}));

const turnOn = () => localStorage.setItem('ferni:sound-director', 'true');

beforeEach(() => {
  vi.resetModules();
  nodes.oscillators = 0;
  nodes.bufferSources = 0;
  proceduralPlays.effects = [];
  earcons.length = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sound.ui', () => {
  async function readySoundUI() {
    vi.useFakeTimers();
    const { soundUI } = await import('../../../src/ui/sound.ui.js');
    soundUI.init();
    document.dispatchEvent(new Event('click')); // the audio context starts on first interaction
    return soundUI;
  }

  it('flag off: a tap click still sounds', async () => {
    const soundUI = await readySoundUI();
    soundUI.play('click');
    vi.runAllTimers();
    expect(nodes.oscillators).toBeGreaterThan(0);
  });

  it('flag on: a tap click is silent, the arrival goes to the earcon output', async () => {
    turnOn();
    const soundUI = await readySoundUI();
    soundUI.play('click');
    soundUI.play('success');
    vi.advanceTimersByTime(5000);
    soundUI.play('enter', 'arrival');
    vi.runAllTimers();
    expect(nodes.oscillators).toBe(0);
    expect(earcons).toEqual(['arrival']);
  });
});

describe('audio.service', () => {
  async function readyAudioService() {
    const { audioService } = await import('../../../src/services/audio.service.js');
    audioService.initialize();
    await Promise.resolve();
    await Promise.resolve();
    return audioService;
  }

  it('flag off: a cameo sound plays', async () => {
    const audioService = await readyAudioService();
    await audioService.playSound('cameo-arrive');
    await audioService.playSoundAndWait('cameo-return');
    expect(proceduralPlays.effects).toEqual(['cameo-arrive', 'cameo-return']);
  });

  it("flag on: a cameo sound is silent, the handoff goes to the earcon output in the new persona's voice", async () => {
    turnOn();
    const audioService = await readyAudioService();
    await audioService.playSound('cameo-arrive');
    await audioService.playSoundAndWait('disconnect');
    await audioService.playHandoffSound('dramatic-entrance', 0, 'maya');
    expect(proceduralPlays.effects).toEqual([]);
    expect(earcons).toEqual(['handoff:maya']);
  });
});

describe('Ferni audio engine (ritual engine, celebrations)', () => {
  async function readyEngine() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'audio/mpeg' },
        arrayBuffer: async () => new ArrayBuffer(8),
      }))
    );
    const { FerniAudioEngine } = await import('../../../src/services/ferni-audio.service.js');
    const engine = new FerniAudioEngine();
    await engine.initialize();
    return engine;
  }

  it('flag off: the connection ritual sound plays', async () => {
    const engine = await readyEngine();
    await engine.play('system.connectionSuccess');
    expect(nodes.bufferSources).toBe(1);
  });

  it('flag on: ritual and celebration sounds are silent', async () => {
    turnOn();
    const engine = await readyEngine();
    await engine.play('system.connectionSuccess');
    await engine.play('celebration.big');
    expect(nodes.bufferSources).toBe(0);
  });
});

describe('persona-magic', () => {
  const created: string[] = [];
  class CountingAudio {
    volume = 1;
    constructor(src: string) {
      created.push(src);
    }
    play = vi.fn(async () => {});
  }

  async function handoff(): Promise<void> {
    created.length = 0;
    vi.stubGlobal('Audio', CountingAudio);
    const { performMagicalHandoff } = await import('../../../src/ui/persona-magic.ui.js');
    await performMagicalHandoff({ fromId: 'ferni', toId: 'jack' });
    await Promise.resolve();
  }

  it('flag off: the handoff MP3 plays', async () => {
    await handoff();
    expect(created).toEqual(['/design-system/sounds/handoff-to-jack.mp3']);
  });

  it('flag on: silent (the handoff chime comes from audio.service only)', async () => {
    turnOn();
    await handoff();
    expect(created).toEqual([]);
  });
});
