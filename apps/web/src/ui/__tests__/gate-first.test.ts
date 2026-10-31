/**
 * Gate-first paint (VITE_GATE_FIRST, on unless 'false'). Runs the head script
 * and the critical style from index.html as shipped, then settles the way
 * app.ts does once initializeAuth resolves.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DURATION } from '../../config/animation-constants.js';

type AuthListener = (state: { isAuthenticated: boolean }) => void;
const auth = vi.hoisted(() => ({ listeners: [] as AuthListener[] }));
vi.mock('../../services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn((cb: AuthListener) => {
    auth.listeners.push(cb);
    return () => undefined;
  }),
}));

const { settleGateFirst, revealApp, isGateFirstPainted, SESSION_HINT_KEY } =
  await import('../gate-first.ui.js');

const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
const headScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!;
const criticalStyle = html.match(/<style id="gate-first-style">([\s\S]*?)<\/style>/)![1]!;
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
const copyReadyScript = html.match(/<script id="gate-first-ready">([\s\S]*?)<\/script>/)![1]!;

/** A cold start: storage as left by the last visit, then index.html's head script. */
function coldStart(opts: {
  buildFlag?: 'true' | 'false';
  tryFirstBuild?: 'true';
  path?: string;
  storage?: Record<string, string>;
}): void {
  localStorage.clear();
  localStorage.setItem('voiceai-theme', 'zen');
  for (const [k, v] of Object.entries(opts.storage ?? {})) localStorage.setItem(k, v);
  window.history.replaceState(null, '', opts.path ?? '/');
  document.documentElement.className = '';
  document.head.innerHTML = `<meta name="theme-color" content="" /><style>${criticalStyle}</style>`;
  document.body.innerHTML = body;
  // Vite replaces %VITE_*% at build time; unset, it stays literal
  let script = opts.buildFlag
    ? headScript.replace('%VITE_GATE_FIRST%', opts.buildFlag)
    : headScript;
  if (opts.tryFirstBuild) script = script.replace('%VITE_TRY_FIRST%', opts.tryFirstBuild);
  runInThisContext(script); // the same global jsdom fills, like the browser's inline script
  runInThisContext(copyReadyScript); // the parser reaches it right after #gateFirst
}

const app = (): HTMLElement => document.getElementById('app')!;
const placeholder = (): HTMLElement | null => document.getElementById('gateFirst');
const homeVisible = (): boolean => getComputedStyle(app()).visibility !== 'hidden';
const placeholderShown = (): boolean =>
  !!placeholder() && getComputedStyle(placeholder()!).display !== 'none';

const shown = (selector: string): boolean =>
  [...placeholder()!.querySelectorAll<HTMLElement>(selector)].every((el) => {
    for (let e: HTMLElement | null = el; e; e = e.parentElement)
      if (getComputedStyle(e).display === 'none') return false;
    return true;
  });

/** The copy and its avatar, as a person sees them (both are laid out from the first frame). */
const copySeen = (): boolean => getComputedStyle(placeholder()!).visibility !== 'hidden';
const avatarSeen = (): boolean =>
  getComputedStyle(placeholder()!.querySelector('.gate-first-paint__logo')!).visibility !==
  'hidden';

let decode: Mock<() => Promise<void>>;
beforeEach(() => {
  vi.useFakeTimers();
  decode = vi.fn(() => Promise.resolve());
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: decode,
  });
});
afterEach(() => {
  vi.useRealTimers();
  revealApp();
});

describe('flag off (VITE_GATE_FIRST=false)', () => {
  it('paints the Home shell exactly as before, with no placeholder', () => {
    coldStart({ buildFlag: 'false' });
    expect(document.documentElement.classList.contains('gate-first')).toBe(false);
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });

  it('does not wait on the gate once auth resolves signed out', () => {
    coldStart({ buildFlag: 'false' });
    settleGateFirst(false);
    expect(placeholder()).toBeNull();
    expect(homeVisible()).toBe(true);
  });

  it('a browser override of false turns it off on a default build', () => {
    coldStart({ storage: { 'ferni:flag:gate-first': 'false' } });
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });
});

describe('flag on (the default), nobody signed in', () => {
  it('paints the gate placeholder and hides #app until auth resolves', () => {
    coldStart({});
    expect(placeholderShown()).toBe(true);
    expect(homeVisible()).toBe(false);
    for (const button of placeholder()!.querySelectorAll('button')) {
      expect(button.disabled).toBe(true); // no dead button that looks live
      expect(button.getAttribute('aria-busy')).toBe('true');
    }
    // Screen readers meet the same dialog the real gate is, named by its heading.
    const copy = placeholder()!;
    expect(copy.getAttribute('role')).toBe('dialog');
    expect(copy.getAttribute('aria-modal')).toBe('true');
    const label = document.getElementById(copy.getAttribute('aria-labelledby') ?? '');
    expect(label?.tagName).toBe('H1');
    expect(label?.textContent).toBe('Welcome to Ferni');
    // Dimming the button with opacity took its text under 4.5:1 on the light page.
    const buttonRule = criticalStyle.match(/\.gate-first-paint__btn\s*\{[^}]*\}/)?.[0] ?? '';
    expect(buttonRule).toContain('color: #1f1f1f');
    expect(buttonRule).not.toMatch(/opacity/);

    vi.advanceTimersByTime(20_000); // a slow boot: still the placeholder, never Home
    expect(homeVisible()).toBe(false);

    // Auth resolved signed out: the copy stays, and Home stays hidden, until the
    // sign-in gate takes its place (sign-in-gate.ui.ts); nothing fades in under a timer
    settleGateFirst(false);
    vi.advanceTimersByTime(20_000);
    expect(isGateFirstPainted()).toBe(true);
    expect(homeVisible()).toBe(false);
  });

  it('a build with VITE_GATE_FIRST=true and a browser override of true both paint it', () => {
    coldStart({ buildFlag: 'true' });
    expect(placeholderShown()).toBe(true);
    coldStart({ buildFlag: 'false', storage: { 'ferni:flag:gate-first': 'true' } });
    expect(placeholderShown()).toBe(true);
    expect(homeVisible()).toBe(false);
  });

  it('mirrors the gate the visitor will get: sign-in only, or try-first above it', () => {
    coldStart({});
    expect(shown('.gate-first-paint__subtitle--sign-in')).toBe(true);
    expect(shown('.gate-first-paint__subtitle--try')).toBe(false);
    expect(shown('.gate-first-paint__try')).toBe(false);

    coldStart({ tryFirstBuild: 'true' }); // prod: VITE_TRY_FIRST=true
    expect(document.documentElement.classList.contains('gate-first-try')).toBe(true);
    expect(shown('.gate-first-paint__subtitle--sign-in')).toBe(false);
    expect(shown('.gate-first-paint__subtitle--try')).toBe(true);
    expect(shown('.gate-first-paint__try')).toBe(true);

    coldStart({ tryFirstBuild: 'true', storage: { 'ferni:flag:try-first': 'false' } });
    expect(shown('.gate-first-paint__try')).toBe(false);
  });

  it('shows the app at once when auth resolves signed in after all', () => {
    coldStart({});
    settleGateFirst(true);
    expect(placeholder()).toBeNull();
    expect(homeVisible()).toBe(true);
  });

  it('leaves pages that replace the app alone', () => {
    coldStart({ path: '/cli-auth' });
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });
});

describe('flag on: the copy waits for its avatar', () => {
  it('stays unseen while the avatar decodes, then the words and the avatar show in one step', async () => {
    let decoded!: () => void;
    decode.mockImplementation(() => new Promise<void>((resolve) => (decoded = resolve)));
    coldStart({});
    expect(placeholderShown()).toBe(true); // laid out, so nothing shifts when it shows
    expect(copySeen()).toBe(false); // no words beside an empty circle
    expect(homeVisible()).toBe(false); // and not Home either

    decoded();
    await vi.advanceTimersByTimeAsync(0);
    expect(copySeen()).toBe(true);
    expect(avatarSeen()).toBe(true);
  });

  it('a slow avatar holds it no longer than DURATION.SLOW, so the screen is never left blank', async () => {
    decode.mockImplementation(() => new Promise<void>(() => undefined)); // never decodes
    coldStart({});
    await vi.advanceTimersByTimeAsync(DURATION.SLOW - 1);
    expect(copySeen()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(copySeen()).toBe(true);
    expect(avatarSeen()).toBe(true);
  });

  it('a broken avatar does not hold it at all', async () => {
    decode.mockImplementation(() => Promise.reject(new Error('EncodingError')));
    coldStart({});
    await vi.advanceTimersByTimeAsync(0);
    expect(copySeen()).toBe(true);
  });

  it('flag off or signed in: nothing waits, nothing is fetched early, no copy classes', () => {
    for (const opts of [
      { buildFlag: 'false' as const, tryFirstBuild: 'true' as const },
      { tryFirstBuild: 'true' as const, storage: { [SESSION_HINT_KEY]: '1' } },
    ]) {
      vi.clearAllTimers();
      coldStart(opts);
      expect(decode).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(document.head.querySelector('link[rel="preload"]')).toBeNull();
      expect(
        [...document.documentElement.classList].filter((c) => c.startsWith('gate-first'))
      ).toEqual([]);
      expect(homeVisible()).toBe(true);
    }
  });
});

describe('flag on, a remembered session', () => {
  it('paints Home as before when the last visit was signed in', () => {
    coldStart({ storage: { [SESSION_HINT_KEY]: '1' } });
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });

  it('also trusts a session Firebase kept in localStorage', () => {
    coldStart({ storage: { 'firebase:authUser:key:[DEFAULT]': '{}' } });
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });
});

describe('session hint', () => {
  it('is written when signed in and cleared on sign-out', () => {
    coldStart({});
    settleGateFirst(true);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
    expect(auth.listeners).toHaveLength(1);
    auth.listeners[0]!({ isAuthenticated: false });
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    settleGateFirst(true);
    expect(auth.listeners).toHaveLength(1); // subscribed once
  });
});
