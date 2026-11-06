/**
 * Try-first on the sign-in gate, both flag states, through the real gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AUDIO_START_WATCH_STORAGE_KEY } from '../../config/audio-start-watch-flag.js';
import { TRY_FIRST_STORAGE_KEY, isTryFirstEnabled } from '../../config/try-first-flag.js';
import {
  DemoCallError,
  liveKitDemoRoom,
  type DemoCall,
  type UmdRoom,
} from '../../services/demo-call.service.js';

type AuthListener = (state: { isAuthenticated: boolean }) => void;
const authListeners: AuthListener[] = [];
vi.mock('../../services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn((cb: AuthListener) => {
    authListeners.push(cb);
    return () => undefined;
  }),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../services/push-preference.js', () => ({ signOutReleasingPush: vi.fn() }));

const startDemoCall = vi.fn<() => Promise<DemoCall>>();
vi.mock('../../services/demo-call.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/demo-call.service.js')>();
  return { ...real, startDemoCall: () => startDemoCall() };
});

interface ControllableCall {
  ended: Promise<void>;
  end: Mock<DemoCall['end']>;
  resumeAudio: Mock<DemoCall['resumeAudio']>;
  onPlaybackBlocked: DemoCall['onPlaybackBlocked'];
  onAudioNotStarted: DemoCall['onAudioNotStarted'];
  finish: () => void;
  block: (blocked: boolean) => void;
  silent: () => (() => void) | undefined;
}

function controllableCall(): ControllableCall {
  let finish: () => void = () => undefined;
  let onBlocked: (blocked: boolean) => void = () => undefined;
  let onSilent: () => (() => void) | undefined = () => undefined;
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    ended,
    end: vi.fn(() => finish()),
    resumeAudio: vi.fn(async () => undefined),
    onPlaybackBlocked: (cb) => {
      onBlocked = cb;
    },
    onAudioNotStarted: (cb) => {
      onSilent = cb;
    },
    finish: () => finish(),
    block: (blocked) => onBlocked(blocked),
    silent: () => onSilent(),
  };
}

async function openGate(): Promise<HTMLElement> {
  const { showSignInGate } = await import('../sign-in-gate.ui.js');
  void showSignInGate();
  await Promise.resolve(); // try-first sets the subtitle once the gate is on the page
  return document.querySelector<HTMLElement>('.sign-in-gate-content')!;
}

const talkButton = (gate: HTMLElement): HTMLButtonElement | null =>
  gate.querySelector<HTMLButtonElement>('[data-provider="try-first"]');
const providers = (gate: HTMLElement): string[] =>
  [...gate.querySelectorAll<HTMLElement>('.sign-in-gate-btn')].map((b) => b.dataset.provider ?? '');

beforeEach(() => {
  startDemoCall.mockReset();
  authListeners.length = 0;
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
    expect(providers(gate)).toEqual(['google']); // Apple stays hidden on the web until its flag is on
    expect(gate.querySelector('.try-first')).toBeNull();
    expect(gate.dataset.tryFirst).toBeUndefined();
    expect(gate.querySelector('.sign-in-gate-subtitle')?.textContent).toMatch(
      /^Sign in to start your journey/
    );
  });
});

describe('sign-in gate with try-first on', () => {
  beforeEach(() => {
    localStorage.setItem(TRY_FIRST_STORAGE_KEY, 'true');
  });

  it('offers "Talk to Ferni" alongside the sign-in buttons', async () => {
    const gate = await openGate();
    expect(talkButton(gate)?.textContent).toBe('Talk to Ferni');
    expect(providers(gate)).toEqual(['google', 'try-first', 'try-first-hear']);
    expect(gate.querySelector('.sign-in-gate-subtitle')?.textContent).toBe(
      'Say hello first. Sign in whenever you want to keep the conversation.'
    );
    expect(gate.querySelector('.try-first-note')?.textContent).toBe(
      'No account needed. Just say hello.'
    );
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
    expect(gate.querySelector('.try-first-keep-message')?.textContent).toMatch(
      /^Sign in and Ferni will remember/
    );
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
    expect(gate.querySelector('.try-first-status')?.textContent).toContain(
      "Ferni couldn't pick up"
    );
  });
});

describe('try-first edge cases', () => {
  beforeEach(() => {
    localStorage.setItem(TRY_FIRST_STORAGE_KEY, 'true');
  });

  it('keeps the button on a cooldown, with a try-later message', async () => {
    startDemoCall.mockRejectedValue(new DemoCallError('cooldown'));
    const gate = await openGate();
    talkButton(gate)!.click();
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('idle'));
    expect(talkButton(gate)?.disabled).toBe(false);
    expect(gate.querySelector('.try-first-status')?.textContent).toMatch(/^Give it a few minutes/);
  });

  it('offers "Tap to hear Ferni" while the browser blocks his audio', async () => {
    const call = controllableCall();
    startDemoCall.mockResolvedValue(call);
    const gate = await openGate();
    talkButton(gate)!.click();
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('in-call'));
    const hear = gate.querySelector<HTMLButtonElement>('[data-provider="try-first-hear"]')!;
    expect(hear.hidden).toBe(true);
    call.block(true);
    expect(hear.hidden).toBe(false);
    expect(hear.textContent).toBe('Tap to hear Ferni');
    hear.click();
    expect(call.resumeAudio).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(hear.hidden).toBe(true));
  });

  it("says the sound didn't start when none of Ferni's audio plays", async () => {
    const call = controllableCall();
    startDemoCall.mockResolvedValue(call);
    const gate = await openGate();
    talkButton(gate)!.click();
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('in-call'));
    const status = gate.querySelector('.try-first-status');
    const before = status?.textContent;
    const remove = call.silent();
    expect(status?.textContent).toBe("The sound didn't start. Try again in a moment.");

    remove?.(); // his audio started after all: only our line is undone
    expect(status?.textContent).toBe(before);
  });

  it('ends the demo call when the visitor signs in, here or in another tab', async () => {
    const call = controllableCall();
    startDemoCall.mockResolvedValue(call);
    const gate = await openGate();
    talkButton(gate)!.click();
    await vi.waitFor(() => expect(gate.dataset.tryFirst).toBe('in-call'));
    for (const listener of [...authListeners]) listener({ isAuthenticated: true });
    expect(call.end).toHaveBeenCalled();
  });
});

describe('try-first copy', () => {
  // "Calling Ferni…" keeps a real ellipsis (Seth, 2026-10-29); three dots stay banned.
  it('follows the voice text rules: no em dashes, and no three-dot ellipses', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const raw = readFileSync(path.resolve(__dirname, '../../i18n/locales/en-US.json'), 'utf8');
    const copy = (JSON.parse(raw) as { tryFirst: Record<string, string> }).tryFirst;
    expect(Object.keys(copy).length).toBeGreaterThan(5);
    for (const line of Object.values(copy)) expect(line).not.toMatch(/—|\.\.\./);
  });
});

describe('try-first button, per phase (connect copy, Seth 2026-10-29)', () => {
  beforeEach(() => {
    localStorage.setItem(TRY_FIRST_STORAGE_KEY, 'true');
  });

  /** A call that starts when the test says so */
  function deferredCall(): { call: ControllableCall; pickUp: () => Promise<void> } {
    const call = controllableCall();
    let resolve: (c: DemoCall) => void = () => undefined;
    startDemoCall.mockReturnValue(new Promise<DemoCall>((r) => (resolve = r)));
    return {
      call,
      pickUp: async () => {
        resolve(call);
        await vi.advanceTimersByTimeAsync(0);
      },
    };
  }
  /** The gate button has no aria-label, so its text is what a screen reader says */
  const spoken = (btn: HTMLButtonElement): string | null =>
    btn.getAttribute('aria-label') ?? btn.textContent;

  it('idle: "Talk to Ferni"', async () => {
    const gate = await openGate();
    const btn = talkButton(gate)!;
    expect(btn.textContent).toBe('Talk to Ferni');
    expect(spoken(btn)).toBe('Talk to Ferni');
  });

  it('connecting: "Calling Ferni…", then "Still reaching Ferni…" after 4 s', async () => {
    deferredCall();
    const gate = await openGate();
    vi.useFakeTimers();
    const btn = talkButton(gate)!;
    btn.click();
    expect(gate.dataset.tryFirst).toBe('connecting');
    expect(btn.textContent).toBe('Calling Ferni…');
    expect(spoken(btn)).toBe('Calling Ferni…');
    vi.advanceTimersByTime(3999);
    expect(btn.textContent).toBe('Calling Ferni…');
    vi.advanceTimersByTime(1);
    expect(btn.textContent).toBe('Still reaching Ferni…');
  });

  it('in-call: "End call", and a pick-up before 4 s clears the slow label', async () => {
    const { pickUp } = deferredCall();
    const gate = await openGate();
    vi.useFakeTimers();
    const btn = talkButton(gate)!;
    btn.click();
    vi.advanceTimersByTime(2000);
    await pickUp();
    expect(gate.dataset.tryFirst).toBe('in-call');
    vi.advanceTimersByTime(10_000);
    expect(btn.textContent).toBe('End call');
    expect(spoken(btn)).toBe('End call');
  });

  it('a failed connect before 4 s goes back to "Talk to Ferni" and stays there', async () => {
    startDemoCall.mockRejectedValue(new DemoCallError('unavailable'));
    const gate = await openGate();
    vi.useFakeTimers();
    const btn = talkButton(gate)!;
    btn.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.dataset.tryFirst).toBe('idle');
    vi.advanceTimersByTime(10_000);
    expect(btn.textContent).toBe('Talk to Ferni');
  });

  it('ended: the button resets to "Talk to Ferni" behind the keep prompt', async () => {
    const { call, pickUp } = deferredCall();
    const gate = await openGate();
    vi.useFakeTimers();
    const btn = talkButton(gate)!;
    btn.click();
    await pickUp();
    call.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.dataset.tryFirst).toBe('ended');
    expect(btn.textContent).toBe('Talk to Ferni');
  });
});

describe('try-first over a real demo call: Ferni joins, his track never plays', () => {
  beforeEach(() => {
    localStorage.setItem(TRY_FIRST_STORAGE_KEY, 'true');
  });

  /** window.LiveKit's Room as the demo sees it, with Ferni already in it. */
  function silentFerniRoom(ferni: {
    identity: string;
    isAgent: boolean;
    audioTrackPublications: Map<string, unknown>;
  }): UmdRoom & { emit: (event: string, ...args: unknown[]) => void } {
    const handlers = new Map<string, ((...args: never[]) => void)[]>();
    return {
      state: 'connected',
      canPlaybackAudio: true,
      remoteParticipants: new Map([[ferni.identity, ferni]]),
      localParticipant: { setMicrophoneEnabled: async () => undefined },
      connect: async () => undefined,
      disconnect: async () => undefined,
      startAudio: async () => undefined,
      on(event: string, cb: (...args: never[]) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), cb]);
        return this;
      },
      off(event: string, cb: (...args: never[]) => void) {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== cb)
        );
        return this;
      },
      emit(event: string, ...args: unknown[]) {
        for (const h of handlers.get(event) ?? []) (h as (...a: unknown[]) => void)(...args);
      },
    };
  }

  /** Talk to Ferni on the real demo call; at 2 s his track arrives and never plays. */
  async function callWithSilentFerni(): Promise<{ gate: HTMLElement; status: Element }> {
    const real = await vi.importActual<typeof import('../../services/demo-call.service.js')>(
      '../../services/demo-call.service.js'
    );
    const ferni = {
      identity: 'agent-1',
      isAgent: true,
      audioTrackPublications: new Map<string, unknown>(),
    };
    const umd = silentFerniRoom(ferni);
    startDemoCall.mockImplementation(() =>
      real.startDemoCall({
        fetchFn: (async () =>
          new Response(
            JSON.stringify({
              token: 'jwt',
              url: 'wss://example.livekit.cloud',
              room: 'demo-demo_1',
              claim_token: 'claim-abc',
              agent_dispatched: true,
              expires_in_minutes: 3,
            }),
            { status: 200 }
          )) as unknown as typeof fetch,
        createRoom: () => liveKitDemoRoom(() => umd),
        requestMicrophone: async () => undefined,
      })
    );
    const gate = await openGate();
    vi.useFakeTimers();
    talkButton(gate)!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.dataset.tryFirst).toBe('in-call');
    await vi.advanceTimersByTimeAsync(2_000);
    const track = {
      kind: 'audio',
      attachedElements: [] as HTMLMediaElement[],
      attach() {
        const el = document.createElement('audio');
        track.attachedElements.push(el);
        return el;
      },
    };
    const publication = { kind: 'audio', track };
    ferni.audioTrackPublications.set('TR_1', publication);
    umd.emit('trackSubscribed', track, publication, ferni);
    return { gate, status: gate.querySelector('.try-first-status')! };
  }

  it("with WEB_AUDIO_START_WATCH on: the status line says the sound didn't start", async () => {
    localStorage.setItem(AUDIO_START_WATCH_STORAGE_KEY, 'true');
    const { status } = await callWithSilentFerni();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(status.textContent).toBe("The sound didn't start. Try again in a moment.");
  });

  it('with the flag off (the default): the page, focus and timers stay exactly as they were', async () => {
    await callWithSilentFerni();
    const page = document.body.innerHTML;
    const focused = document.activeElement;
    const timers = vi.getTimerCount();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(document.body.innerHTML).toBe(page);
    expect(document.activeElement).toBe(focused);
    expect(vi.getTimerCount()).toBe(timers);
  });
});
