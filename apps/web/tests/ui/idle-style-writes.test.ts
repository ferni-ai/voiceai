/**
 * Nothing re-styles the page every frame while it is idle.
 *
 * Measured in the dev app (Chrome, 390x844): breath-sync and emotional-color
 * wrote 17 custom properties on :root every animation frame and the eye
 * tracker forced a layout every frame, before a call even started. A custom
 * property on :root changes every element's computed style, so each frame
 * re-ran style for ~2,000 elements. No stylesheet read any of those values.
 * These tests pin the fixed shape: root writes happen only when a value
 * changes, and the eye-tracking loop stops once the gaze settles.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let frames: FrameRequestCallback[] = [];
let clock = 0;

/** Run queued animation frames, `count` times, 16 ms apart. */
function step(count: number): void {
  for (let i = 0; i < count; i++) {
    clock += 16;
    const due = frames;
    frames = [];
    for (const cb of due) cb(clock);
  }
}

function spyRootWrites() {
  return vi.spyOn(document.documentElement.style, 'setProperty');
}

beforeEach(() => {
  vi.resetModules();
  frames = [];
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  document.documentElement.removeAttribute('style');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('breath sync', () => {
  it('does not write the per-frame breath phase to :root', async () => {
    const writes = spyRootWrites();
    const { initBreathSync, destroyBreathSync } = await import('../../src/systems/breath-sync.js');
    const breath = initBreathSync();
    step(5);
    writes.mockClear();

    const phases = new Set<number>();
    for (let i = 0; i < 60; i++) {
      step(1);
      phases.add(breath.getPhase());
    }

    // The breath really is moving, frame to frame...
    expect(phases.size).toBeGreaterThan(30);
    // ...but :root is not touched while its rate and depth hold
    expect(writes).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--breath-rate-ms')).toMatch(/^\d+ms$/);
    destroyBreathSync();
  });
});

describe('emotional color', () => {
  it('writes :root only while an emotion transitions', async () => {
    const writes = spyRootWrites();
    const { initBreathSync, destroyBreathSync } = await import('../../src/systems/breath-sync.js');
    const { initEmotionalColor, destroyEmotionalColor } = await import('../../src/systems/emotional-color.js');
    initBreathSync();
    const color = initEmotionalColor();
    step(5);
    writes.mockClear();

    step(60); // idle: breath and ambient drift still modulate the JS state
    expect(writes).not.toHaveBeenCalled();

    color.setEmotion('joy');
    step(10);
    const duringTransition = writes.mock.calls.map(([name]) => name);
    expect(duringTransition).toContain('--emotional-warmth');

    step(200); // past the transition
    writes.mockClear();
    step(60);
    expect(writes).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--emotional-state')).toBe('joy');
    destroyEmotionalColor();
    destroyBreathSync();
  });
});

describe('eye tracking', () => {
  it('stops its frame loop once the gaze settles, and mousemove restarts it', async () => {
    Object.defineProperty(Element.prototype, 'animate', {
      value: () => ({ cancel: vi.fn(), finished: Promise.resolve(), onfinish: null }),
      configurable: true,
    });
    document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const { initPresenceUI, dispose } = await import('../../src/ui/presence.ui.js');
    initPresenceUI();

    step(400);
    rect.mockClear();
    step(60);
    // Settled: no per-frame layout reads (each one forced a style + layout pass)
    expect(rect).not.toHaveBeenCalled();

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 40 }));
    step(3);
    expect(rect).toHaveBeenCalled();
    dispose();
  });
});
