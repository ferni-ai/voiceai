/**
 * The procedural handoff chime can play into the sound director's earcon gain
 * (routeTo) instead of straight to the speakers, so the handoff shares the
 * one master gain with the other earcons.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

function fakeContext() {
  const destination = { name: 'speakers' };
  const outputs: unknown[] = [];
  const node = () => ({
    connect: vi.fn((target: unknown) => {
      if (target === destination || (target as { name?: string }).name === 'earcon-gain') {
        outputs.push(target);
      }
    }),
    disconnect: vi.fn(),
  });
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination,
    resume: vi.fn(async () => {}),
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() }),
    createOscillator: () => ({
      ...node(),
      type: 'sine',
      frequency: param(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
  };
  return { ctx: ctx as unknown as AudioContext, destination, outputs };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('procedural handoff chime output', () => {
  it('goes to the speakers by default', async () => {
    const { proceduralSounds } = await import('../../../src/services/procedural-sounds.service.js');
    const { ctx, destination, outputs } = fakeContext();
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return ctx;
    });
    const played = proceduralSounds.playHandoffSound('maya');
    await vi.runAllTimersAsync();
    await played;
    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs.every((target) => target === destination)).toBe(true);
  });

  it('goes only to the earcon gain once routed', async () => {
    const { proceduralSounds } = await import('../../../src/services/procedural-sounds.service.js');
    const { ctx, outputs } = fakeContext();
    const earconGain = { name: 'earcon-gain' } as unknown as AudioNode;
    proceduralSounds.routeTo(ctx, earconGain);
    const played = proceduralSounds.playHandoffSound('maya');
    await vi.runAllTimersAsync();
    await played;
    expect(outputs.length).toBe(4); // one per note of Maya's chime
    expect(outputs.every((target) => target === earconGain)).toBe(true);
  });
});
