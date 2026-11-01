/**
 * Listen nods: pure logic. Fake clock and scheduler, so timing is exact.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../../src/config/motion-flags.js';

import {
  createListenNods,
  isListenNodsEnabled,
  listenCueFrom,
  MAX_WIRE_DELAY_MS,
  MIN_NOD_GAP_MS,
  type ListenNodDeps,
  type NodIntensity,
} from '../../../src/ui/avatar-motion/listen-nods.js';

interface Harness {
  deps: ListenNodDeps;
  nods: { at: number; intensity: NodIntensity }[];
  smiles: number[];
  advance: (ms: number) => void;
  reduced: { value: boolean };
}

function harness(): Harness {
  let clock = 10_000;
  let timers: { due: number; fn: () => void }[] = [];
  const nods: Harness['nods'] = [];
  const smiles: number[] = [];
  const reduced = { value: false };
  const deps: ListenNodDeps = {
    nod: (intensity) => nods.push({ at: clock, intensity }),
    smile: () => smiles.push(clock),
    reducedMotion: () => reduced.value,
    now: () => clock,
    schedule: (fn, delayMs) => timers.push({ due: clock + delayMs, fn }),
  };
  const advance = (ms: number): void => {
    const end = clock + ms;
    for (;;) {
      const next = timers.filter((t) => t.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      timers = timers.filter((t) => t !== next);
      clock = next.due;
      next.fn();
    }
    clock = end;
  };
  return { deps, nods, smiles, advance, reduced };
}

describe('listenCueFrom', () => {
  it('reads a backchannel with its wire delay', () => {
    expect(
      listenCueFrom({ type: 'backchannel_played', kind: 'backchannel', wireDelayMs: 60 })
    ).toEqual({
      kind: 'backchannel',
      delayMs: 60,
    });
  });

  it('reads a laugh', () => {
    expect(listenCueFrom({ type: 'backchannel_played', kind: 'laugh', wireDelayMs: 220 })).toEqual({
      kind: 'laugh',
      delayMs: 220,
    });
  });

  it('clamps a missing, negative or huge wire delay', () => {
    expect(listenCueFrom({ type: 'backchannel_played', kind: 'backchannel' })).toEqual({
      kind: 'backchannel',
      delayMs: 0,
    });
    expect(listenCueFrom({ type: 'backchannel_played', wireDelayMs: -5 })).toEqual({
      kind: 'backchannel',
      delayMs: 0,
    });
    expect(listenCueFrom({ type: 'backchannel_played', wireDelayMs: 99_999 })).toEqual({
      kind: 'backchannel',
      delayMs: MAX_WIRE_DELAY_MS,
    });
  });

  it('reads an active listening nod with its intensity', () => {
    expect(
      listenCueFrom({
        type: 'humanization_signal',
        signalType: 'active_listening_nod',
        nodType: 'visible',
      })
    ).toEqual({ kind: 'listening_nod', intensity: 'visible' });
    expect(
      listenCueFrom({ type: 'humanization_signal', signalType: 'active_listening_nod' })
    ).toEqual({
      kind: 'listening_nod',
      intensity: 'micro',
    });
  });

  it('ignores other messages', () => {
    expect(listenCueFrom({ type: 'humanization_signal', signalType: 'breakthrough' })).toBeNull();
    expect(listenCueFrom({ type: 'speech_state', innerType: 'speech_pause' })).toBeNull();
    expect(listenCueFrom(null)).toBeNull();
  });
});

describe('createListenNods', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('nods when the backchannel reaches the wire, not before', () => {
    const nods = createListenNods(h.deps);
    nods.handle({ kind: 'backchannel', delayMs: 220 });
    h.advance(219);
    expect(h.nods).toHaveLength(0);
    h.advance(1);
    expect(h.nods).toEqual([{ at: 10_220, intensity: 'subtle' }]);
  });

  it('nods at once when the wire delay is zero', () => {
    createListenNods(h.deps).handle({ kind: 'backchannel', delayMs: 0 });
    expect(h.nods).toEqual([{ at: 10_000, intensity: 'subtle' }]);
  });

  it('smiles for a laugh, on its wire delay, without nodding', () => {
    createListenNods(h.deps).handle({ kind: 'laugh', delayMs: 60 });
    h.advance(59);
    expect(h.smiles).toHaveLength(0);
    h.advance(1);
    expect(h.smiles).toEqual([10_060]);
    expect(h.nods).toHaveLength(0);
  });

  it('nods on an active listening nod with the agent intensity', () => {
    createListenNods(h.deps).handle({ kind: 'listening_nod', intensity: 'visible' });
    expect(h.nods).toEqual([{ at: 10_000, intensity: 'visible' }]);
  });

  it('nods at most once per 1.2 s', () => {
    const nods = createListenNods(h.deps);
    nods.handle({ kind: 'listening_nod', intensity: 'micro' });
    h.advance(MIN_NOD_GAP_MS - 1);
    nods.handle({ kind: 'backchannel', delayMs: 0 });
    nods.handle({ kind: 'listening_nod', intensity: 'micro' });
    expect(h.nods).toHaveLength(1);
    h.advance(1);
    nods.handle({ kind: 'listening_nod', intensity: 'subtle' });
    expect(h.nods.map((n) => n.at)).toEqual([10_000, 10_000 + MIN_NOD_GAP_MS]);
  });

  it('rate-limits by when the nod lands, not when the message arrived', () => {
    const nods = createListenNods(h.deps);
    nods.handle({ kind: 'backchannel', delayMs: 600 });
    h.advance(100);
    nods.handle({ kind: 'listening_nod', intensity: 'micro' });
    h.advance(500);
    expect(h.nods).toEqual([{ at: 10_100, intensity: 'micro' }]);
  });

  it('does not move at all under reduced motion', () => {
    h.reduced.value = true;
    const nods = createListenNods(h.deps);
    nods.handle({ kind: 'backchannel', delayMs: 0 });
    nods.handle({ kind: 'laugh', delayMs: 0 });
    nods.handle({ kind: 'listening_nod', intensity: 'visible' });
    h.advance(5000);
    expect(h.nods).toHaveLength(0);
    expect(h.smiles).toHaveLength(0);
  });
});

describe('isListenNodsEnabled', () => {
  beforeEach(() => localStorage.removeItem(MOTION_FLAG_KEYS.listenNods));

  it('is off by default', () => {
    expect(isListenNodsEnabled()).toBe(false);
  });

  it('is on only for the string true', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.listenNods, '1');
    expect(isListenNodsEnabled()).toBe(false);
    localStorage.setItem(MOTION_FLAG_KEYS.listenNods, 'true');
    expect(isListenNodsEnabled()).toBe(true);
  });
});
