/**
 * The legacy easter-egg achievement card (flag off) sat bottom-right at 20 px,
 * over the controls band and the phone menu trigger. It now anchors top-right,
 * below the status island and inside the safe area.
 *
 * jsdom has no layout, so this pins the anchoring the card is given; the
 * rendered geometry is checked in the overlay gallery (Chromium).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
  Element.prototype.animate = vi.fn() as unknown as Element['animate'];
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

// The old per-surface toasts: the kill-switch path of src/ui/overlay/toast-flag.ts.
beforeEach(() => vi.stubEnv('VITE_TOAST_REGION', 'off'));
afterEach(() => vi.unstubAllEnvs());

describe('easter-egg achievement card placement', () => {
  it('anchors top-right below the status island, inside the safe area, never at the bottom', async () => {
    const eggs = await import('../../src/ui/easter-eggs.ui.js');
    eggs.initEasterEggsUI();
    const avatar = document.getElementById('coachAvatar');
    for (let i = 0; i < 3; i++) avatar?.click(); // triple-click unlocks an achievement

    const card = document.querySelector<HTMLElement>('.achievement-notification');
    expect(card).not.toBeNull();
    expect(card?.style.position).toBe('fixed');
    expect(card?.style.bottom).toBe('');
    expect(card?.style.top).toContain('safe-area-inset-top');
    expect(card?.style.top).toContain('4.5rem');
    expect(card?.style.right).toBe('1rem');
    eggs.easterEggsUI.dispose();
  });
});
