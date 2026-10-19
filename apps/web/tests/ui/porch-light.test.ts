/**
 * Porch light (VITE_PORCH_LIGHT, off by default): a call that starts in the
 * caller's small hours lights a warm halo around the avatar for the call. No
 * overlay, no pointer events, no fade under reduced motion, nothing with an
 * unknown time zone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  PORCH_LIGHT_LIT_CLASS,
  PORCH_LIGHT_STORAGE_KEY,
  disposePorchLight,
  inQuietHours,
  initPorchLight,
} from '../../src/ui/porch-light.ui.js';

const ZONE = 'America/New_York';
/** Caller's local wall time on 2026-10-11 in New York (EDT, UTC-4). */
const at = (hhmm: string): Date => new Date(`2026-10-11T${hhmm}:00-04:00`);

function mountAvatar(): HTMLElement {
  document.body.innerHTML =
    '<div id="coach"><div class="avatar-container"><img id="coachAvatar" alt=""></div><button id="talk">Talk</button></div>';
  return document.querySelector<HTMLElement>('.avatar-container')!;
}

function reducedMotion(on: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: on && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const startCall = () => document.dispatchEvent(new CustomEvent('ferni:connected'));
const endCall = () => document.dispatchEvent(new CustomEvent('ferni:disconnected'));
const glow = () => document.querySelector<HTMLElement>('.porch-light__glow');

beforeEach(() => {
  localStorage.setItem(PORCH_LIGHT_STORAGE_KEY, 'true');
  reducedMotion(false);
});
afterEach(() => {
  disposePorchLight();
  localStorage.removeItem(PORCH_LIGHT_STORAGE_KEY);
  vi.unstubAllEnvs();
  document.body.innerHTML = '';
  document.getElementById('porch-light-styles')?.remove();
});

describe('flag off (default)', () => {
  it('does nothing on a 2am call', () => {
    localStorage.removeItem(PORCH_LIGHT_STORAGE_KEY);
    const avatar = mountAvatar();
    expect(initPorchLight({ now: () => at('02:10'), timeZone: () => ZONE })).toBe(false);
    startCall();
    expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(false);
    expect(glow()).toBeNull();
  });

  it('turns on with VITE_PORCH_LIGHT=true', () => {
    localStorage.removeItem(PORCH_LIGHT_STORAGE_KEY);
    vi.stubEnv('VITE_PORCH_LIGHT', 'true');
    const avatar = mountAvatar();
    expect(initPorchLight({ now: () => at('02:10'), timeZone: () => ZONE })).toBe(true);
    startCall();
    expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(true);
  });
});

describe('flag on', () => {
  it.each(['23:00', '02:10', '04:59'])(
    'a call started at %s local lights the lamp for the call',
    (hhmm) => {
      const avatar = mountAvatar();
      initPorchLight({ now: () => at(hhmm), timeZone: () => ZONE });
      expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(false);
      startCall();
      expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(true);
      expect(glow()?.parentElement).toBe(avatar);
      endCall();
      expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(false);
    }
  );

  it.each(['05:00', '12:00', '22:59'])('a call started at %s local leaves it off', (hhmm) => {
    const avatar = mountAvatar();
    initPorchLight({ now: () => at(hhmm), timeZone: () => ZONE });
    startCall();
    expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(false);
    expect(glow()).toBeNull();
  });

  it.each([[undefined], [''], ['Not/AZone']])('with no known zone (%s) leaves it off', (zone) => {
    const avatar = mountAvatar();
    initPorchLight({ now: () => at('02:10'), timeZone: () => zone });
    startCall();
    expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(false);
  });

  it('is no overlay: the halo sits inside the avatar, hidden from screen readers, and takes no taps', () => {
    mountAvatar();
    initPorchLight({ now: () => at('02:10'), timeZone: () => ZONE });
    startCall();
    const el = glow()!;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.closest('.avatar-container')).not.toBeNull();
    expect(document.getElementById('talk')?.contains(el)).toBe(false);
    const css = document.getElementById('porch-light-styles')?.textContent ?? '';
    expect(css).toMatch(/\.porch-light__glow\s*\{[^}]*pointer-events:\s*none/);
    expect(css).not.toMatch(/position:\s*fixed|z-index/);
  });

  it('fades up over about 600ms with motion allowed', () => {
    mountAvatar();
    initPorchLight({ now: () => at('02:10'), timeZone: () => ZONE });
    startCall();
    expect(glow()?.dataset.motion).toBeUndefined();
    const css = document.getElementById('porch-light-styles')?.textContent ?? '';
    expect(css).toContain('transition: opacity calc(var(--duration-slow) * 2)');
  });

  it('under reduced motion is simply lit: no fade', () => {
    reducedMotion(true);
    const avatar = mountAvatar();
    initPorchLight({ now: () => at('02:10'), timeZone: () => ZONE });
    startCall();
    expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(true);
    expect(glow()?.dataset.motion).toBe('none');
    const css = document.getElementById('porch-light-styles')?.textContent ?? '';
    expect(css).toMatch(
      /\.porch-light__glow\[data-motion='none'\]\s*\{\s*transition:\s*none;\s*\}/
    );
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition:\s*none/);
  });

  it('dispose removes the halo and stops listening', () => {
    const avatar = mountAvatar();
    initPorchLight({ now: () => at('02:10'), timeZone: () => ZONE });
    disposePorchLight();
    startCall();
    expect(avatar.classList.contains(PORCH_LIGHT_LIT_CLASS)).toBe(false);
    expect(glow()).toBeNull();
  });
});

describe('inQuietHours', () => {
  it('uses the given zone, not the machine clock', () => {
    const instant = new Date('2026-10-11T02:10:00+09:00');
    expect(inQuietHours(instant, 'Asia/Tokyo')).toBe(true);
    expect(inQuietHours(instant, ZONE)).toBe(false);
  });
});
