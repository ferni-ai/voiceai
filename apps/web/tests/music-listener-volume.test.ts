/**
 * Now Playing volume slider and mute.
 *
 * The slider used to call an `onVolumeChange` callback nobody set. It now sets
 * the listener's music level in the browser, right away, on top of ducking.
 * (The agent's `volume` music_control action only affects the NEXT track:
 * LiveKit's BackgroundAudioPlayer fixes a track's volume when it starts.)
 *
 * @vitest-environment jsdom
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gainNodes: MockGainNode[] = [];

class MockGainNode {
  gain = {
    value: 1.0,
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createGain = vi.fn(() => {
    const node = new MockGainNode();
    gainNodes.push(node);
    return node;
  });
  createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
  createAnalyser = vi.fn(() => ({
    fftSize: 256,
    frequencyBinCount: 128,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn(),
  }));
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

vi.stubGlobal('AudioContext', MockAudioContext);
// The modules imported below schedule timers at import (luxo-expressions auto-init)
// and while showing the Now Playing card. Real ones would fire after jsdom is torn
// down ("document is not defined"); fake them and drop them after each test.
vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
afterEach(() => {
  vi.clearAllTimers();
});
afterAll(() => {
  vi.useRealTimers();
});
// jsdom has no Web Animations API; the Now Playing card animates in
Element.prototype.animate = vi.fn(
  () => ({ finished: Promise.resolve(), cancel: vi.fn(), onfinish: null }) as unknown as Animation
);

const { getMusicAudioController } = await import('../src/services/music-audio.controller.js');
const { handleMusic } = await import('../src/app/data-message-handlers.js');

function lastRampTarget(): number | undefined {
  const calls = gainNodes.at(-1)?.gain.linearRampToValueAtTime.mock.calls ?? [];
  return calls.at(-1)?.[0] as number | undefined;
}

describe('listener volume', () => {
  beforeEach(() => {
    gainNodes.length = 0;
    getMusicAudioController().cleanup();
  });

  afterEach(() => {
    const controller = getMusicAudioController();
    controller.setListenerVolume(100);
    controller.cleanup();
  });

  it('the slider level scales the music gain immediately; 0 mutes', async () => {
    const controller = getMusicAudioController();
    await controller.attachMusicTrack(document.createElement('audio'), 'track-1');

    controller.setListenerVolume(30);
    expect(lastRampTarget()).toBeCloseTo(0.3);

    controller.setListenerVolume(0);
    expect(lastRampTarget()).toBe(0);
  });

  it('ducking still applies on top of the listener level', async () => {
    const controller = getMusicAudioController();
    await controller.attachMusicTrack(document.createElement('audio'), 'track-2');
    controller.setListenerVolume(50);

    controller.duckForAgent();
    expect(lastRampTarget()).toBeCloseTo(0.04 * 0.5);
  });

  it('a track attached after the slider moved starts at the listener level', async () => {
    const controller = getMusicAudioController();
    controller.setListenerVolume(40);
    await controller.attachMusicTrack(document.createElement('audio'), 'track-3');
    expect(gainNodes.at(-1)?.gain.value).toBeCloseTo(0.4);
  });

  it('without Web Audio, the fallback element volume follows the slider', async () => {
    const controller = getMusicAudioController();
    const ctx = new MockAudioContext();
    ctx.createMediaElementSource = vi.fn(() => {
      throw new Error('Web Audio unavailable');
    });
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return ctx;
      })
    );
    const audio = document.createElement('audio');
    await controller.attachMusicTrack(audio, 'track-fallback');
    vi.stubGlobal('AudioContext', MockAudioContext);

    controller.setListenerVolume(25);
    expect(audio.volume).toBeCloseTo(0.25);
  });
});

describe('Now Playing wiring', () => {
  it("a playing track's card sends slider changes to the listener volume", async () => {
    const setListenerVolume = vi.spyOn(getMusicAudioController(), 'setListenerVolume');
    handleMusic({
      type: 'music',
      state: 'playing',
      trackName: 'Blue in Green',
      artistName: 'Miles Davis',
    });

    const slider = document.querySelector<HTMLInputElement>('.now-playing__volume-slider');
    const muteButton = document.querySelector<HTMLButtonElement>('.now-playing__btn--volume');
    expect(slider?.value).toBe('100'); // matches the default listener level

    slider!.value = '45';
    slider!.dispatchEvent(new Event('input'));
    expect(setListenerVolume).toHaveBeenLastCalledWith(45);

    muteButton!.click();
    expect(setListenerVolume).toHaveBeenLastCalledWith(0);
    muteButton!.click();
    expect(setListenerVolume).toHaveBeenLastCalledWith(45);
  });
});
