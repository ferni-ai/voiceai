/**
 * Gate-first paint (VITE_GATE_FIRST, off by default). Runs the head script
 * and the critical style from index.html as shipped, then settles the way
 * app.ts does once initializeAuth resolves.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURATION } from '../../config/animation-constants.js';

type AuthListener = (state: { isAuthenticated: boolean }) => void;
const auth = vi.hoisted(() => ({ listeners: [] as AuthListener[] }));
vi.mock('../../services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn((cb: AuthListener) => {
    auth.listeners.push(cb);
    return () => undefined;
  }),
}));

const { settleGateFirst, revealApp, SESSION_HINT_KEY } = await import('../gate-first.ui.js');

const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
const headScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!;
const criticalStyle = html.match(/<style id="gate-first-style">([\s\S]*?)<\/style>/)![1]!;
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;

/** A cold start: storage as left by the last visit, then index.html's head script. */
function coldStart(opts: { buildFlag?: boolean; path?: string; storage?: Record<string, string> }): void {
  localStorage.clear();
  localStorage.setItem('voiceai-theme', 'zen');
  for (const [k, v] of Object.entries(opts.storage ?? {})) localStorage.setItem(k, v);
  window.history.replaceState(null, '', opts.path ?? '/');
  document.documentElement.className = '';
  document.head.innerHTML = `<meta name="theme-color" content="" /><style>${criticalStyle}</style>`;
  document.body.innerHTML = body;
  // Vite replaces %VITE_GATE_FIRST% at build time; unset, it stays literal
  const script = opts.buildFlag ? headScript.replace('%VITE_GATE_FIRST%', 'true') : headScript;
  runInThisContext(script); // the same global jsdom fills, like the browser's inline script
}

const app = (): HTMLElement => document.getElementById('app')!;
const placeholder = (): HTMLElement | null => document.getElementById('gateFirst');
const homeVisible = (): boolean => getComputedStyle(app()).visibility !== 'hidden';
const placeholderShown = (): boolean => !!placeholder() && getComputedStyle(placeholder()!).display !== 'none';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  revealApp();
});

describe('flag off (default)', () => {
  it('paints the Home shell exactly as before, with no placeholder', () => {
    coldStart({});
    expect(document.documentElement.classList.contains('gate-first')).toBe(false);
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });

  it('does not wait on the gate once auth resolves signed out', () => {
    coldStart({});
    settleGateFirst(false);
    expect(placeholder()).toBeNull();
    expect(homeVisible()).toBe(true);
  });

  it('a browser override of false beats a build with the flag on', () => {
    coldStart({ buildFlag: true, storage: { 'ferni:flag:gate-first': 'false' } });
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });
});

describe('flag on, nobody signed in', () => {
  it('paints the gate placeholder and hides #app until auth resolves', () => {
    coldStart({ buildFlag: true });
    expect(placeholderShown()).toBe(true);
    expect(homeVisible()).toBe(false);
    const button = placeholder()!.querySelector('button')!;
    expect(button.disabled).toBe(true); // no dead button that looks live
    expect(button.getAttribute('aria-busy')).toBe('true');
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

    settleGateFirst(false); // auth resolved signed out; the real gate fades in now
    vi.advanceTimersByTime(DURATION.SLOW - 1);
    expect(placeholderShown()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(placeholder()).toBeNull();
    expect(homeVisible()).toBe(true); // behind the real gate, which keeps it inert
  });

  it('turns on for one browser with the localStorage override', () => {
    coldStart({ storage: { 'ferni:flag:gate-first': 'true' } });
    expect(placeholderShown()).toBe(true);
    expect(homeVisible()).toBe(false);
  });

  it('shows the app at once when auth resolves signed in after all', () => {
    coldStart({ buildFlag: true });
    settleGateFirst(true);
    expect(placeholder()).toBeNull();
    expect(homeVisible()).toBe(true);
  });

  it('leaves pages that replace the app alone', () => {
    coldStart({ buildFlag: true, path: '/cli-auth' });
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });
});

describe('flag on, a remembered session', () => {
  it('paints Home as before when the last visit was signed in', () => {
    coldStart({ buildFlag: true, storage: { [SESSION_HINT_KEY]: '1' } });
    expect(homeVisible()).toBe(true);
    expect(placeholderShown()).toBe(false);
  });

  it('also trusts a session Firebase kept in localStorage', () => {
    coldStart({ buildFlag: true, storage: { 'firebase:authUser:key:[DEFAULT]': '{}' } });
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
