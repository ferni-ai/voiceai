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

  it('starts the remaining systems when one throws', async () => {
    vi.resetModules();
    vi.doMock('../../src/ui/color/index.js', () => ({
      initColorSystem: (): void => {
        throw new Error('color boom');
      },
    }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fresh = await import('../../src/app/visual-systems.js');
    const freshSystems = await import('../../src/systems/index.js');

    try {
      expect(() => fresh.initVisualSystems('ferni')).not.toThrow();
      expect(rootVar('--breath-phase')).not.toBe('');
      expect(document.getElementById('mood-typography-styles')).not.toBeNull();
      expect(errors.mock.calls.flat().join(' ')).toContain('color system');
    } finally {
      freshSystems.destroyTranscendentSystems();
      errors.mockRestore();
      vi.doUnmock('../../src/ui/color/index.js');
    }
  });

  it('seeds the mood palette from the active persona', () => {
    initVisualSystems('ferni');
    const ferni = rootVar('--mood-primary');
    destroyTranscendentSystems();

    initVisualSystems('maya');

    expect(rootVar('--mood-primary')).not.toBe(ferni);
  });
});
