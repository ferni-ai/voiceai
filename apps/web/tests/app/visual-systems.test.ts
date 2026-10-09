/**
 * initVisualSystems is app.ts's single startup call for the animation, color
 * and typography systems. Color and typography had no caller before it.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initVisualSystems } from '../../src/app/visual-systems.js';
import { destroyTranscendentSystems } from '../../src/systems/index.js';

const STYLE_IDS = [
  'ferni-time-fading-styles',
  'ferni-persona-harmony-styles',
  'mood-typography-styles',
  'persona-typography-styles',
];

const rootVar = (name: string): string => document.documentElement.style.getPropertyValue(name);

describe('initVisualSystems', () => {
  // jsdom has no IntersectionObserver; every browser the app targets does
  beforeAll(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    );
  });

  afterEach(() => {
    destroyTranscendentSystems();
    document.head.querySelectorAll('style[id]').forEach((s) => s.remove());
    document.documentElement.removeAttribute('style');
  });

  it('starts the animation, color and typography systems', () => {
    expect(rootVar('--breath-phase')).toBe('');
    expect(STYLE_IDS.filter((id) => document.getElementById(id))).toEqual([]);

    initVisualSystems('ferni');

    expect(rootVar('--breath-phase')).not.toBe('');
    expect(rootVar('--mood-primary')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(STYLE_IDS.filter((id) => document.getElementById(id))).toEqual(STYLE_IDS);
  });

  it('seeds the mood palette from the active persona', () => {
    initVisualSystems('ferni');
    const ferni = rootVar('--mood-primary');
    destroyTranscendentSystems();

    initVisualSystems('maya');

    expect(rootVar('--mood-primary')).not.toBe(ferni);
  });
});
