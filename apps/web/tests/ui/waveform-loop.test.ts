/**
 * The waveform animates only while it is visible and in a call.
 *
 * Measured in the dev app (phone profile, 4x CPU): the bars' rAF loop started
 * at the Connect tap and ran through connecting while the bars were hidden
 * (`#waveformContainer:not(.active) .waveform-bars { opacity: 0 }`), and any
 * later setSpeaking / setEmotion / setListening restarted it after hang-up, so
 * it ran forever at idle. A persona switch also read the colour back with
 * getComputedStyle inside a frame, forcing a 36 ms style recalc. These tests
 * pin the fixed shape: no frames before start() or after stop(), none while
 * the page is hidden, and no computed-style reads.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

let frames = new Map<number, FrameRequestCallback>();
let nextId = 1;
let clock = 0;
let hidden = false;

function step(count: number): void {
  for (let i = 0; i < count; i++) {
    clock += 16;
    const due = [...frames.values()];
    frames = new Map();
    for (const cb of due) cb(clock);
  }
}
const looping = (): boolean => frames.size > 0;
function setHidden(value: boolean): void {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

let waveform: typeof import('../../src/ui/waveform.ui.js');

beforeEach(async () => {
  vi.resetModules();
  frames = new Map();
  clock = 0;
  hidden = false;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.body.innerHTML = '<div id="waveformContainer"><div class="waveform-bars"></div><div class="emotion-indicator"></div></div>';
  waveform = await import('../../src/ui/waveform.ui.js');
  waveform.initWaveformUI();
});

afterEach(() => {
  waveform.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('waveform frame loop', () => {
  it('does not run while connecting (bars hidden, not started)', () => {
    waveform.setThinking(true);
    waveform.setListening(true);
    step(3);
    expect(looping()).toBe(false);
  });

  it('runs once the call starts and the bars move', () => {
    waveform.start();
    expect(looping()).toBe(true);
    step(5);
    const bar = document.querySelector<HTMLElement>('.waveform-bar');
    expect(bar?.style.height).toMatch(/px$/);
    expect(looping()).toBe(true);
  });

  it('stops on hang-up and nothing restarts it afterwards', () => {
    waveform.start();
    step(3);
    waveform.stop();
    step(2);
    expect(looping()).toBe(false);
    waveform.setSpeaking(true);
    waveform.setListening(true);
    waveform.setThinking(true);
    waveform.setEmotion('excited', 1);
    waveform.setMusicPlaying(true);
    waveform.setSpeaking(false);
    step(3);
    expect(looping()).toBe(false);
  });

  it('stops while the page is hidden and resumes when shown', () => {
    waveform.start();
    step(2);
    setHidden(true);
    step(2);
    expect(looping()).toBe(false);
    setHidden(false);
    expect(looping()).toBe(true);
  });

  it('never reads computed style, including on a persona switch', () => {
    const spy = vi.spyOn(window, 'getComputedStyle');
    waveform.start();
    waveform.setPersona('peter');
    step(5);
    expect(spy).not.toHaveBeenCalled();
    const container = document.getElementById('waveformContainer') as HTMLElement;
    expect(container.style.getPropertyValue('--waveform-color')).toContain('var(--persona-primary');
  });
});
