/**
 * The lab is same-origin with the admin and the app, so the theme it could save
 * is theirs. Inside the lab, the T key and the (hidden) theme toggle change
 * nothing: no theme is written to localStorage and the page keeps its theme.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real theme start and theme store; the boot around it is stubbed.
vi.mock('../../src/i18n/index.js', () => ({
  initI18n: async () => undefined,
  t: (k: string) => k,
}));
vi.mock('../../src/utils/gsap-animations.js', () => ({ initGSAP: vi.fn() }));
vi.mock('../../src/ui/waveform.ui.js', () => ({ initWaveformUI: vi.fn() }));
vi.mock('../../src/ui/avatar-boot.js', () => ({ bootAvatarNow: vi.fn(), scheduleAvatar: vi.fn() }));
vi.mock('../../src/ui/avatar-motion/turn-driver.js', () => ({
  createTurnDriver: vi.fn(),
  defaultTargets: {},
  turnSettleMs: () => 0,
}));
vi.mock('../../src/services/circadian-manager.js', () => ({
  circadianManager: { injectStyles: vi.fn(), init: vi.fn() },
}));
vi.mock('../../src/services/warmth-manager.js', () => ({
  warmthManager: { injectStyles: vi.fn(), init: vi.fn() },
}));
vi.mock('../../src/services/persona-aura.js', () => ({
  personaAura: { injectStyles: vi.fn(), init: vi.fn() },
}));
vi.mock('../../src/ui/magnetic-hover.ui.js', () => ({ initMagneticHover: vi.fn() }));
vi.mock('../../src/state/app.state.js', () => ({ appState: { get: () => null } }));

import { startAvatarLab } from '../../src/avatar-lab/index.js';

/** Everything in localStorage, by key. */
function storedEntries(): Record<string, string | null> {
  const entries: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) entries[key] = localStorage.getItem(key);
  }
  return entries;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"><button id="themeToggle"></button></div>';
});

describe('the avatar lab and the saved theme', () => {
  it('writes no theme when T is pressed or the toggle is clicked', async () => {
    await startAvatarLab();
    const theme = document.documentElement.getAttribute('data-theme');
    const saved = storedEntries();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'T' }));
    document.getElementById('themeToggle')?.click();

    expect(storedEntries()).toEqual(saved);
    expect(localStorage.getItem('voiceai-theme')).toBe(saved['voiceai-theme'] ?? null);
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
  });
});
