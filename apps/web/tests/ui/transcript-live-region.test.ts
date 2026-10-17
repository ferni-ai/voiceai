/**
 * Captions reach screen readers.
 *
 * Before: the live caption pill had no aria-live, so screen-reader users got
 * nothing. Announcing every interim update would flood them, so finished
 * lines are announced politely once they settle (the speaker-cues pattern).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFERENCE_KEYS } from '../../src/config/storage-keys.js';
import {
  CAPTION_ANNOUNCE_SETTLE_MS,
  dispose,
  finalize,
  initTranscriptUI,
  updateInterim,
} from '../../src/ui/transcript.ui.js';

const region = (): HTMLElement | null => document.querySelector('[aria-live="polite"]');

describe('transcript live region', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION, 'true');
    document.body.innerHTML = `
      <div id="transcriptContainer" class="status-pill"><p class="transcript-text" id="transcriptText"></p></div>`;
    initTranscriptUI();
  });

  afterEach(() => {
    dispose();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('adds one polite live region next to the captions', () => {
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(region()?.getAttribute('role')).toBe('log');
  });

  it('announces a finished line after it settles, and never interim text', () => {
    updateInterim('I was think');
    updateInterim('I was thinking about');
    vi.advanceTimersByTime(CAPTION_ANNOUNCE_SETTLE_MS * 2);
    expect(region()?.textContent).toBe('');

    finalize('I was thinking about the trip.');
    vi.advanceTimersByTime(CAPTION_ANNOUNCE_SETTLE_MS - 1);
    expect(region()?.textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(region()?.textContent).toBe('I was thinking about the trip.');
  });

  it('reads lines that finish close together as one announcement, losing none', () => {
    finalize('Sounds good.');
    vi.advanceTimersByTime(CAPTION_ANNOUNCE_SETTLE_MS / 2);
    finalize('Talk tomorrow?');
    vi.advanceTimersByTime(CAPTION_ANNOUNCE_SETTLE_MS);

    expect(region()?.textContent).toBe('Sounds good. Talk tomorrow?');
  });
});
