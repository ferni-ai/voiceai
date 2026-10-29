/**
 * The sign-in gate and the gate-first copy (motion audit 2026-10-29, P8).
 *
 * Signed out on a cold start, index.html paints a copy of the gate. The real
 * gate must take its place in one step (never a cross-fade, so never two
 * avatars), only once its avatar can paint, and keep Home hidden under it.
 * Without a copy (a mid-session sign-out), Home is hidden as the gate starts
 * to fade in, so the two never show through each other either.
 * The frame-by-frame check in a browser is tests/first-paint/first-paint.spec.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURATION } from '../../src/config/animation-constants.js';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn(() => () => undefined),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: vi.fn() }));
vi.mock('../../src/services/access-check.js', () => ({
  checkAccess: vi.fn(() => new Promise(() => undefined)),
}));

const { showSignInGate, hideSignInGate } = await import('../../src/ui/sign-in-gate.ui.js');
const { GATE_UP_CLASS } = await import('../../src/ui/gate-first.ui.js');

const html = document.documentElement;
const overlay = (): HTMLElement | null => document.querySelector('.sign-in-gate-overlay');
const copy = (): HTMLElement | null => document.getElementById('gateFirst');

/** The page as index.html leaves it: the copy up when `painted`, Home underneath. */
function page(painted: boolean): void {
  html.className = painted ? 'gate-first' : '';
  document.body.innerHTML = `
    <div id="gateFirst" class="gate-first-paint" hidden><img class="gate-first-paint__logo" src="/ferni-avatar.svg" /></div>
    <div id="app"><div id="coach"></div></div>`;
}

let decode: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  decode = vi.fn(() => Promise.resolve());
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: decode,
  });
});

afterEach(() => {
  hideSignInGate();
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
  html.className = '';
});

describe('signed out on a cold start, the copy painted', () => {
  it('the gate replaces the copy in the same step, at full opacity, with no fade', async () => {
    page(true);
    const batches: MutationRecord[][] = [];
    const observer = new MutationObserver((records) => batches.push(records));
    observer.observe(document.body, { childList: true });

    void showSignInGate();
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
    observer.disconnect();

    // One batch both adds the gate and removes the copy: no frame can show both, or neither
    const swap = batches.find((records) =>
      records.some((r) => [...r.addedNodes].includes(overlay()!))
    );
    expect(
      swap?.some((r) => [...r.removedNodes].some((n) => (n as Element).id === 'gateFirst'))
    ).toBe(true);
    expect(copy()).toBeNull();
    expect(overlay()!.style.transition).toBe('none');
    expect(overlay()!.classList.contains('visible')).toBe(true);
    // Home stays hidden (and paused) under the gate: gate-first handed over to sign-in-gate-up
    expect(html.classList.contains('gate-first')).toBe(false);
    expect(html.classList.contains(GATE_UP_CLASS)).toBe(true);
    expect(document.getElementById('app')!.inert).toBe(true);
  });

  it('waits for its avatar to decode before swapping, so the circle is never empty', async () => {
    page(true);
    let decoded!: () => void;
    decode.mockImplementation(() => new Promise<void>((resolve) => (decoded = resolve)));

    void showSignInGate();
    await Promise.resolve();
    expect(decode).toHaveBeenCalled();
    expect(overlay()).toBeNull(); // the copy is still the screen
    expect(copy()).not.toBeNull();

    decoded();
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
    expect(copy()).toBeNull();
  });

  it('a slow avatar holds the copy no longer than DURATION.SLOW', async () => {
    page(true);
    decode.mockImplementation(() => new Promise<void>(() => undefined)); // never decodes

    void showSignInGate();
    await vi.advanceTimersByTimeAsync(DURATION.SLOW - 1);
    expect(overlay()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(overlay()).not.toBeNull();
    expect(copy()).toBeNull();
  });
});

describe('no copy (flag off, or a sign-out mid-session)', () => {
  it('hides Home as the gate starts to fade in, so they never show through each other', async () => {
    page(false);
    void showSignInGate();
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
    expect(decode).not.toHaveBeenCalled(); // nothing to match: the fade covers the decode
    expect(overlay()!.style.transition).toBe('');
    expect(overlay()!.classList.contains('visible')).toBe(true);
    expect(html.classList.contains(GATE_UP_CLASS)).toBe(true);
  });
});

it('signing in gives Home back as the gate fades out', async () => {
  page(true);
  void showSignInGate();
  await vi.waitFor(() => expect(overlay()).not.toBeNull());

  hideSignInGate();
  expect(html.classList.contains(GATE_UP_CLASS)).toBe(false);
  expect(document.getElementById('app')!.inert).toBe(false);
  expect(overlay()!.classList.contains('hiding')).toBe(true);
  expect(overlay()!.style.transition).toBe(''); // the fade-out runs
  vi.advanceTimersByTime(DURATION.SLOW);
  expect(overlay()).toBeNull();
});
