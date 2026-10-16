/**
 * Breath in the live region (captions-breath on): the breath dots at a pause,
 * and the finished-line marker. Its own file, because the live region keeps one
 * captions instance per module, and this one must be made with the flag on.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTIONS_BREATH_STORAGE_KEY,
  CAPTIONS_V2_STORAGE_KEY,
} from '@/ui/captions/captions-flag.js';
import { initLiveCaptions } from '@/ui/captions/live-captions.js';

const say = (type: string, text: string, isFinal?: boolean): void => {
  window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
};
const region = (): Element | null => document.querySelector('.ferni-captions');
const dots = (): boolean => region()?.classList.contains('ferni-captions--breathing') ?? false;
const lastLine = (): Element | null => document.querySelector('.ferni-caption-line:last-child');

describe('breath in the live region', () => {
  beforeAll(() => {
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'true');
    localStorage.setItem(CAPTIONS_BREATH_STORAGE_KEY, 'true');
    initLiveCaptions(() => true);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    // Connection drop resets the region, so each test starts with no words.
    window.dispatchEvent(
      new CustomEvent('ferni:connection-state', { detail: { state: 'disconnected' } })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('injects the breath rules and renders Ferni words as spans', () => {
    say('agent', 'Then let us', false);
    expect(document.getElementById('ferni-captions-breath-styles')).not.toBeNull();
    expect(document.querySelectorAll('.ferni-captions .ferni-caption-word')).toHaveLength(3);
  });

  it('shows the breath dots once Ferni has been quiet for a beat', () => {
    say('agent', 'Then let us', false);
    expect(dots()).toBe(false);
    vi.advanceTimersByTime(700);
    expect(dots()).toBe(true);
  });

  it('takes the dots away when Ferni speaks again', () => {
    say('agent', 'Then let us', false);
    vi.advanceTimersByTime(700);
    say('agent', 'Then let us protect it', false);
    expect(dots()).toBe(false);
  });

  it('takes the dots away when the caller speaks, and never shows them for the caller', () => {
    say('agent', 'Then let us', false);
    say('user', 'Yes', false);
    vi.advanceTimersByTime(700);
    expect(dots()).toBe(false);
  });

  it('never shows the dots once the turn has ended', () => {
    say('agent', 'Then let us protect it.', true);
    vi.advanceTimersByTime(700);
    expect(dots()).toBe(false);
  });

  it('marks a finished line, so the underline on its last word goes', () => {
    say('agent', 'Then let us', false);
    expect(lastLine()?.classList.contains('ferni-caption-line--final')).toBe(false);
    say('agent', 'Then let us protect it.', true);
    expect(lastLine()?.classList.contains('ferni-caption-line--final')).toBe(true);
  });
  it('clears the dots when the call ends, even mid-pause', () => {
    say('agent', 'Then let us', false);
    vi.advanceTimersByTime(700);
    expect(dots()).toBe(true);
    window.dispatchEvent(
      new CustomEvent('ferni:connection-state', { detail: { state: 'disconnected' } })
    );
    expect(dots()).toBe(false);
  });

  it('keeps the finished marker on a line that is redrawn when a new segment starts', () => {
    say('agent', 'That makes a lot of sense.', true);
    say('agent', 'When you said it went sideways', false);
    const first = document.querySelector('.ferni-caption-line');
    expect(first?.classList.contains('ferni-caption-line--final')).toBe(true);
    expect(first?.classList.contains('ferni-caption-line--settled')).toBe(true);
  });
});
