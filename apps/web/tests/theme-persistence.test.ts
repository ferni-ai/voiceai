/**
 * A chosen theme survives a reload.
 *
 * Every new account has the default UI-theme cosmetic equipped, and applying
 * it on load forced (and saved) the light theme: picking Night Ink, or using a
 * dark system theme, lasted only until the next reload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function load(storedTheme: string | null, prefersDark = false) {
  vi.resetModules();
  localStorage.clear();
  if (storedTheme) localStorage.setItem('voiceai-theme', storedTheme);
  window.matchMedia = ((q: string) =>
    ({ matches: prefersDark && q.includes('dark'), addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
  const { initTheme } = await import('../src/theme/index.js');
  const { initCosmeticsService } = await import('../src/services/cosmetics.service.js');
  initTheme(); // as app.ts does on load
  initCosmeticsService(); // with the default cosmetics a new account has
  return document.documentElement.getAttribute('data-theme');
}

beforeEach(() => document.documentElement.removeAttribute('data-theme'));

describe('theme on load', () => {
  it('keeps Night Ink when that was chosen', async () => {
    expect(await load('midnight')).toBe('midnight');
    expect(localStorage.getItem('voiceai-theme')).toBe('midnight');
  });

  it('follows a dark system theme when nothing was chosen, without saving a choice', async () => {
    expect(await load(null, true)).toBe('midnight');
    expect(localStorage.getItem('voiceai-theme')).toBeNull();
  });

  it('keeps the light theme when that was chosen', async () => {
    expect(await load('zen', true)).toBe('zen');
  });
});
