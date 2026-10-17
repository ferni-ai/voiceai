/**
 * Try-first on the sign-in gate, both flag states, through the real gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRY_FIRST_STORAGE_KEY, isTryFirstEnabled } from '../../config/try-first-flag.js';
import { DemoCallError, type DemoCall } from '../../services/demo-call.service.js';

vi.mock('../../services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn(() => () => undefined),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../services/push-preference.js', () => ({ signOutReleasingPush: vi.fn() }));

const startDemoCall = vi.fn<() => Promise<DemoCall>>();
vi.mock('../../services/demo-call.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/demo-call.service.js')>();
  return { ...real, startDemoCall: () => startDemoCall() };
});

function controllableCall(): DemoCall & { finish: () => void } {
  let finish: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { ended, end: vi.fn(() => finish()), finish: () => finish() };
}

async function openGate(): Promise<HTMLElement> {
  const { showSignInGate } = await import('../sign-in-gate.ui.js');
  void showSignInGate();
  return document.querySelector<HTMLElement>('.sign-in-gate-content')!;
}

const talkButton = (gate: HTMLElement): HTMLButtonElement | null =>
  gate.querySelector<HTMLButtonElement>('[data-provider="try-first"]');
const providers = (gate: HTMLElement): string[] =>
  [...gate.querySelectorAll<HTMLElement>('.sign-in-gate-btn')].map((b) => b.dataset.provider ?? '');

beforeEach(() => {
  startDemoCall.mockReset();
});

afterEach(async () => {
  const { hideSignInGate } = await import('../sign-in-gate.ui.js');
  vi.useFakeTimers();
  hideSignInGate(); // removes the overlay after its fade, so run the fade out
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('try-first flag', () => {
  it('is off by default', () => {
    expect(isTryFirstEnabled()).toBe(false);
  });

  it('turns on from the build env or one browser, and the browser can force it off', () => {
    vi.stubEnv('VITE_TRY_FIRST', 'true');
    expect(isTryFirstEnabled()).toBe(true);
    localStorage.setItem(TRY_FIRST_STORAGE_KEY, 'false');
    expect(isTryFirstEnabled()).toBe(false);
    vi.unstubAllEnvs();
    localStorage.setItem(TRY_FIRST_STORAGE_KEY, 'true');
    expect(isTryFirstEnabled()).toBe(true);
  });
});

describe('sign-in gate with try-first off', () => {
  it('shows only the sign-in buttons, as before', async () => {
    const gate = await openGate();
    expect(talkButton(gate)).toBeNull();
    expect(providers(gate)).toEqual(['google', 'apple']);
    expect(gate.querySelector('.try-first')).toBeNull();
    expect(gate.dataset.tryFirst).toBeUndefined();
  });
});

describe('sign-in gate with try-first on', () => {
  beforeEach(() => {
    localStorage.setItem(TRY_FIRST_STORAGE_KEY, 'true');
  });

  it('offers "Talk to Ferni now" alongside the sign-in buttons', async () => {
    const gate = await openGate();
    expect(talkButton(gate)?.textContent).toBe('Talk to Ferni now');
    expect(providers(gate)).toEqual(['google', 'apple', 'try-first']);
    expect(gate.querySelector('.try-first-note')?.textContent).toBe('No account needed. Just say hello.');
  });

  it('starts a demo call, then asks to keep the conversation when it ends', async () => {
    const call = controllableCall();
    startDemoCall.mockResolvedValue(call);
    const gate = await openGate();

    talkButton(gate)!.click();
    expect(gate.dataset.tryFirst).toBe('connecting');
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('in-call'));
    expect(startDemoCall).toHaveBeenCalledTimes(1);
    expect(talkButton(gate)?.textContent).toBe('End call');

    call.finish(); // Ferni left, or the demo limit closed the room
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('ended'));
    const keepTitle = gate.querySelector<HTMLElement>('.try-first-keep-title')!;
    expect(keepTitle.textContent).toBe('Want to keep this conversation?');
    expect(gate.querySelector('.try-first-keep-message')?.textContent).toMatch(/^Sign in and Ferni will remember/);
    expect(document.activeElement).toBe(keepTitle);
    // The gate's own sign-in buttons are what the prompt points at
    expect(gate.querySelector('[data-provider="google"]')).not.toBeNull();
  });

  it('hangs up when the visitor presses End call', async () => {
    const call = controllableCall();
    startDemoCall.mockResolvedValue(call);
    const gate = await openGate();
    talkButton(gate)!.click();
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('in-call'));

    talkButton(gate)!.click();
    expect(call.end).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('ended'));
  });

  it('says so plainly when the free calls are used up, and leaves sign-in', async () => {
    startDemoCall.mockRejectedValue(new DemoCallError('used_up'));
    const gate = await openGate();
    talkButton(gate)!.click();
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('used-up'));
    expect(gate.querySelector('.try-first-status')?.textContent).toBe(
      "That's all the free calls for today. Sign in to keep talking."
    );
  });

  it('lets the visitor try again after a failure to connect', async () => {
    startDemoCall.mockRejectedValueOnce(new DemoCallError('unavailable'));
    const gate = await openGate();
    talkButton(gate)!.click();
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('idle'));
    expect(talkButton(gate)?.disabled).toBe(false);
    expect(gate.querySelector('.try-first-status')?.textContent).toContain("Ferni couldn't pick up");
  });
});

describe('try-first copy', () => {
  it('follows the voice text rules: no em dashes or ellipses', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const raw = readFileSync(resolve(__dirname, '../../i18n/locales/en-US.json'), 'utf8');
    const copy = (JSON.parse(raw) as { tryFirst: Record<string, string> }).tryFirst;
    expect(Object.keys(copy).length).toBeGreaterThan(5);
    for (const line of Object.values(copy)) expect(line).not.toMatch(/—|…|\.\.\./);
  });
});
