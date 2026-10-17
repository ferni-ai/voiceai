/**
 * Captions with the captions-breath flag off (the default). The live region
 * must render exactly as before Breath: no breath rules, no word spans, no
 * breath classes. Its own file, so the flag is off when the module is made.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { CAPTIONS_V2_STORAGE_KEY } from '@/ui/captions/captions-flag.js';
import { initLiveCaptions } from '@/ui/captions/live-captions.js';

const say = (type: string, text: string, isFinal?: boolean): void => {
  window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
};

describe('captions without breath', () => {
  beforeAll(() => {
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'true');
    initLiveCaptions(() => true);
  });

  it('injects no breath rules and renders no word spans or breath classes', () => {
    say('agent', 'Then let us', false);
    say('agent', 'Then let us protect it.', true);
    expect(document.getElementById('ferni-captions-breath-styles')).toBeNull();
    expect(document.querySelectorAll('.ferni-caption-word')).toHaveLength(0);
    expect(document.querySelectorAll('.ferni-caption-line--final')).toHaveLength(0);
    expect(document.querySelector('.ferni-captions--breathing')).toBeNull();
    const runs = [...document.querySelectorAll('.ferni-caption-words')];
    expect(runs.map((run) => run.textContent).join('')).toBe('Then let us protect it.');
  });
});
