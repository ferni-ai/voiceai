/** The face engine: one writer for Ferni's face, behind ferni:face-engine. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentFace,
  faceEngineEnabled,
  resetFaceEngine,
  setFace,
} from '../src/ui/face/face-engine';

let shown = 0;
beforeEach(() => {
  shown = 0;
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="coachAvatar"><svg id="avatarEyes"></svg></div>';
  Element.prototype.animate = function () {
    if ((this as HTMLElement).classList.contains('face-eye')) shown++;
    return {
      playState: 'finished',
      finished: new Promise(() => undefined),
      cancel: () => undefined,
      commitStyles: () => undefined,
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
});
afterEach(() => {
  resetFaceEngine();
  vi.useRealTimers();
  localStorage.clear();
});

describe('face engine', () => {
  it('is off unless the flag is set', () => {
    expect(faceEngineEnabled()).toBe(false);
    localStorage.setItem('ferni:face-engine', 'true');
    expect(faceEngineEnabled()).toBe(true);
  });

  it('shows a token face and takes over from the old eyes', () => {
    expect(setFace('happy')).toBe(true);
    expect(currentFace()).toBe('happy');
    expect(document.getElementById('coachAvatar')?.classList.contains('face-engine-on')).toBe(true);
    expect(document.querySelectorAll('.face-eye')).toHaveLength(2);
  });

  it('understands the older names', () => {
    setFace('contemplative');
    expect(currentFace()).toBe('thinking');
  });

  it('ignores names that are not faces', () => {
    expect(setFace('not-a-face')).toBe(false);
    expect(currentFace()).toBeNull();
  });

  it('does not replay the face already showing (one change per handoff, not four)', () => {
    setFace('happy', { source: 'reaction' });
    const after = shown;
    expect(setFace('happy', { source: 'reaction' })).toBe(false);
    expect(setFace('happy', { source: 'agent' })).toBe(false);
    expect(shown).toBe(after);
  });

  it('a reaction cannot interrupt a held choreographed face, but can once the hold ends', () => {
    setFace('surprised', { source: 'choreography', hold: 1000 });
    expect(setFace('curious', { source: 'reaction' })).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(setFace('curious', { source: 'reaction' })).toBe(true);
  });

  it('blinks on its own while awake, and not while resting', () => {
    const blink = vi.fn();
    setFace('attentive');
    const before = shown;
    // blink animates the upper lids, not the eye shape
    Element.prototype.animate = function () {
      if ((this as HTMLElement).classList.contains('face-lid-top')) blink();
      return {
        playState: 'finished',
        finished: new Promise(() => undefined),
        cancel: () => undefined,
        commitStyles: () => undefined,
      } as unknown as Animation;
    } as typeof Element.prototype.animate;
    vi.advanceTimersByTime(6100);
    expect(blink).toHaveBeenCalled();
    blink.mockClear();
    setFace('resting', { source: 'choreography' });
    blink.mockClear();
    vi.advanceTimersByTime(12000);
    expect(blink).not.toHaveBeenCalled();
    expect(shown).toBeGreaterThanOrEqual(before);
  });
});
