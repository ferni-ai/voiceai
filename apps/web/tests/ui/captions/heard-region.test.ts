/**
 * Heard in the live region (captions-heard on): the caller's line is faint
 * until its transcript is final, and a check pops once Ferni takes that line.
 * Its own file, because the live region keeps one captions instance per module,
 * and this one must be made with the flag on.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTIONS_HEARD_STORAGE_KEY,
  CAPTIONS_V2_STORAGE_KEY,
} from '@/ui/captions/captions-flag.js';
import { initLiveCaptions } from '@/ui/captions/live-captions.js';

const say = (type: string, text: string, isFinal?: boolean): void => {
  window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
};
const lines = (): Element[] => [
  ...document.querySelectorAll('.ferni-captions__viewport > .ferni-caption-line'),
];
const callerLine = (): Element | undefined =>
  lines().find((l) => l.getAttribute('data-speaker') === 'user');

describe('heard in the live region', () => {
  beforeAll(() => {
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'true');
    localStorage.setItem(CAPTIONS_HEARD_STORAGE_KEY, 'true');
    initLiveCaptions(() => true);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    window.dispatchEvent(
      new CustomEvent('ferni:connection-state', { detail: { state: 'disconnected' } })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('injects the heard rules', () => {
    say('user', 'My sister Ana', false);
    expect(document.getElementById('ferni-captions-heard-styles')).not.toBeNull();
  });

  it('shows the caller line faint while interim, and sharp once it is final', () => {
    say('user', 'My sister Ana', false);
    expect(callerLine()?.classList.contains('ferni-caption-line--interim')).toBe(true);
    say('user', 'My sister Ana starts Monday.', true);
    expect(callerLine()?.classList.contains('ferni-caption-line--interim')).toBe(false);
    expect(callerLine()?.textContent).toBe('My sister Ana starts Monday.');
  });

  it('shows no check while the caller is still speaking', () => {
    say('user', 'My sister Ana starts Monday.', true);
    expect(document.querySelector('.ferni-caption-check')).toBeNull();
  });

  it('pops the check on the settled caller line once Ferni takes the turn, above her reply', () => {
    say('user', 'My sister Ana starts Monday.', true);
    say('agent', 'Nervous for someone is love in disguise.', false);
    expect(callerLine()?.classList.contains('ferni-caption-line--ticked')).toBe(true);
    expect(callerLine()?.querySelector('.ferni-caption-check')).not.toBeNull();
    expect(lines().map((l) => l.textContent)).toEqual([
      'My sister Ana starts Monday.',
      'Nervous for someone is love in disguise.',
    ]);
  });

  it('does not pop the check when Ferni answers before the caller line settles', () => {
    say('user', 'My sister Ana', false);
    say('agent', 'Nervous', false);
    expect(document.querySelector('.ferni-caption-check')).toBeNull();
    expect(callerLine()?.classList.contains('ferni-caption-line--interim')).toBe(true);
  });
});
