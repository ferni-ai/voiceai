/**
 * Captions with the captions-breath and captions-heard flags off (the default).
 * The live region must render exactly as before either flag: no breath or heard
 * rules, no word spans, no breath, interim or check classes. Its own file, so
 * the flags are off when the module is made.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { CAPTIONS_V2_STORAGE_KEY } from '@/ui/captions/captions-flag.js';
import { initLiveCaptions } from '@/ui/captions/live-captions.js';

const say = (type: string, text: string, isFinal?: boolean): void => {
  window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
};

describe('captions without breath or heard', () => {
  beforeAll(() => {
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'true');
    initLiveCaptions(() => true);
  });

  it('injects no breath or heard rules and renders no word spans or extra classes', () => {
    say('user', 'Yes I think so', true);
    say('agent', 'Then let us', false);
    say('agent', 'Then let us protect it.', true);
    expect(document.getElementById('ferni-captions-breath-styles')).toBeNull();
    expect(document.getElementById('ferni-captions-heard-styles')).toBeNull();
    expect(document.querySelectorAll('.ferni-caption-word')).toHaveLength(0);
    expect(document.querySelectorAll('.ferni-caption-line--final')).toHaveLength(0);
    expect(document.querySelectorAll('.ferni-caption-line--interim')).toHaveLength(0);
    expect(document.querySelectorAll('.ferni-caption-line--ticked')).toHaveLength(0);
    expect(document.querySelectorAll('.ferni-caption-check')).toHaveLength(0);
    expect(document.querySelector('.ferni-captions--breathing')).toBeNull();
    const root = document.querySelector('.ferni-captions');
    expect(root?.classList.contains('ferni-captions--caller')).toBe(false);
    expect(root?.classList.contains('ferni-captions--caller-aside')).toBe(false);
    const runs = [...document.querySelectorAll('.ferni-caption-words')];
    expect(runs.map((run) => run.textContent).join('')).toBe('Then let us protect it.');
  });
});
