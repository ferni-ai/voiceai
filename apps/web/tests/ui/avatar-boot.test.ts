/**
 * The avatar boots through one module, used by the app and by the admin avatar
 * lab, so the lab cannot drift from what users see. Every deferred avatar init
 * keeps the name and delay it had in app.ts initializeUI().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { calls, record, recordInteraction, avatarLamp } = vi.hoisted(() => {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(args.length ? `${name}(${args.map(String).join(',')})` : name);
    };
  return { calls, record, recordInteraction: vi.fn(), avatarLamp: { lamp: true } };
});

vi.mock('../../src/ui/coach.ui.js', () => ({ initCoachUI: record('initCoachUI') }));
vi.mock('../../src/ui/expressive-eyes.ui.js', () => ({
  initExpressiveEyes: record('initExpressiveEyes'),
}));
vi.mock('../../src/ui/thinking.ui.js', () => ({ initThinkingUI: record('initThinkingUI') }));
vi.mock('../../src/ui/avatar-motion/natural-blink.js', () => ({
  initNaturalBlink: record('initNaturalBlink'),
}));
vi.mock('../../src/ui/avatar-feedback.ui.js', () => ({
  initAvatarFeedback: record('initAvatarFeedback'),
}));
vi.mock('../../src/ui/presence.ui.js', () => ({ initPresenceUI: record('initPresenceUI') }));
vi.mock('../../src/ui/avatar-tap-reactions.ui.js', () => ({
  initAvatarTapReactionsUI: record('initAvatarTapReactionsUI'),
}));
vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({
  initFerniExpressions: record('initFerniExpressions'),
}));
vi.mock('../../src/emotion/emotion-expression-bridge.js', () => ({
  enableEmotionExpressionBridge: record('enableEmotionExpressionBridge'),
}));
vi.mock('../../src/ui/logo-expressions.ui.js', () => ({
  initLogoExpressions: record('initLogoExpressions'),
  hookIntoAvatarFeedback: record('hookIntoAvatarFeedback'),
}));
vi.mock('../../src/ui/avatar-soul.ui.js', () => ({
  initAvatarSoul: record('initAvatarSoul'),
  avatarSoul: { recordInteraction: (n: number) => recordInteraction(n) },
}));
vi.mock('../../src/ui/avatar-lamp.ui.js', () => ({
  initAvatarLamp: record('initAvatarLamp'),
  avatarLamp,
}));
vi.mock('../../src/ui/ambient-life.ui.js', () => ({ initAmbientLife: record('initAmbientLife') }));

import type { AvatarBootRunner } from '../../src/ui/avatar-boot.js';

type AvatarBoot = typeof import('../../src/ui/avatar-boot.js');

/** Copied from app.ts initializeUI() before the move: name and delay of each avatar init. */
const APP_AVATAR_STEPS = [
  { name: 'ThinkingUI', delayMs: 100 },
  { name: 'AvatarFeedback', delayMs: 100 },
  { name: 'PresenceUI', delayMs: 300 },
  { name: 'AvatarTapReactionsUI', delayMs: 400 },
  { name: 'FerniExpressions', delayMs: 300 },
  { name: 'EmotionExpressionBridge', delayMs: 400 },
  { name: 'LogoExpressions', delayMs: 400 },
  { name: 'AvatarSoul', delayMs: 600 },
  { name: 'AvatarLamp', delayMs: 700 },
  { name: 'AmbientLife', delayMs: 800 },
];

interface Registered {
  kind: 'now' | 'later';
  name: string;
  delayMs?: number;
  fn: () => void | Promise<void>;
}

function recordingRunner(): { run: AvatarBootRunner; registered: Registered[] } {
  const registered: Registered[] = [];
  return {
    registered,
    run: {
      now: (name, fn) => registered.push({ kind: 'now', name, fn }),
      later: (name, delayMs, fn) => registered.push({ kind: 'later', name, delayMs, fn }),
    },
  };
}

/** Every listener a test adds; afterEach removes them so no test sees another's. */
const added: { target: EventTarget; type: string; handler: EventListener }[] = [];
const trackingListen = vi.fn((target: EventTarget, type: string, handler: EventListener) => {
  added.push({ target, type, handler });
  target.addEventListener(type, handler);
});

/** startCues and startTurns that record when they run. */
function turnStarters(active = true): {
  startCues: () => Promise<void>;
  startTurns: () => boolean;
} {
  return {
    startCues: vi.fn(() => {
      calls.push('startCues');
      return Promise.resolve();
    }),
    startTurns: vi.fn(() => {
      calls.push('startTurns');
      return active;
    }),
  };
}

let boot: AvatarBoot;

describe('avatar boot', () => {
  beforeEach(async () => {
    // A fresh module registry per test, so the dynamic imports load (and mark) again.
    vi.resetModules();
    // Registered per test, so each test sees when the gestures module loads relative to the rest.
    vi.doMock('../../src/ui/avatar-motion/turn-gestures.js', () => {
      calls.push('load turn-gestures');
      return { initTurnGestures: record('initTurnGestures') };
    });
    boot = await import('../../src/ui/avatar-boot.js');
    calls.length = 0;
    recordInteraction.mockClear();
    trackingListen.mockClear();
    delete (window as unknown as Record<string, unknown>).__avatarLamp;
  });

  afterEach(() => {
    for (const { target, type, handler } of added.splice(0)) {
      target.removeEventListener(type, handler);
    }
    vi.restoreAllMocks();
  });

  it('lists the avatar steps with the names and delays app.ts used', () => {
    expect(boot.AVATAR_BOOT_STEPS).toEqual(APP_AVATAR_STEPS);
  });

  it('scheduleAvatar registers exactly those steps, in order, at those delays', () => {
    const { run, registered } = recordingRunner();
    boot.scheduleAvatar(run, { ...turnStarters(), listen: trackingListen });
    expect(registered.map(({ kind, name, delayMs }) => ({ kind, name, delayMs }))).toEqual(
      APP_AVATAR_STEPS.map((s) => ({ kind: 'later', ...s }))
    );
    expect(calls).toEqual([]); // nothing runs until the runner fires it
  });

  it('running every step calls each init once, ThinkingUI in its old order', async () => {
    const { run, registered } = recordingRunner();
    const starters = turnStarters();
    boot.scheduleAvatar(run, { ...starters, listen: trackingListen });
    for (const step of registered) await step.fn();

    expect(calls).toEqual([
      'initThinkingUI',
      'startCues',
      'load turn-gestures',
      'startTurns',
      'initTurnGestures(true)',
      'initNaturalBlink',
      'initAvatarFeedback',
      'initPresenceUI',
      'initAvatarTapReactionsUI',
      'initFerniExpressions',
      'enableEmotionExpressionBridge',
      'initLogoExpressions',
      'hookIntoAvatarFeedback',
      'initAvatarSoul',
      'initAvatarLamp',
      'initAmbientLife',
    ]);
    expect(starters.startCues).toHaveBeenCalledTimes(1);
    expect(starters.startTurns).toHaveBeenCalledTimes(1);
    expect((window as unknown as Record<string, unknown>).__avatarLamp).toBe(avatarLamp);
  });

  it('starts turns only after the gestures module has loaded, then gestures at once', async () => {
    const { run, registered } = recordingRunner();
    boot.scheduleAvatar(run, { ...turnStarters(), listen: trackingListen });
    await registered[0].fn();

    // No await between startTurns and initTurnGestures: a turn event cannot reach the
    // driver while gestures are still loading.
    const turns = calls.indexOf('startTurns');
    expect(calls.indexOf('load turn-gestures')).toBeGreaterThan(calls.indexOf('startCues'));
    expect(turns).toBeGreaterThan(calls.indexOf('load turn-gestures'));
    expect(calls[turns + 1]).toBe('initTurnGestures(true)');
  });

  it('passes what startTurns returns to initTurnGestures', async () => {
    const { run, registered } = recordingRunner();
    boot.scheduleAvatar(run, { ...turnStarters(false), listen: trackingListen });
    await registered[0].fn();
    expect(calls).toContain('initTurnGestures(false)');
    expect(calls).not.toContain('initTurnGestures(true)');
  });

  it('runs without startCues', async () => {
    const { run, registered } = recordingRunner();
    boot.scheduleAvatar(run, { startTurns: () => true, listen: trackingListen });
    await registered[0].fn();
    expect(calls).toEqual([
      'initThinkingUI',
      'load turn-gestures',
      'initTurnGestures(true)',
      'initNaturalBlink',
    ]);
  });

  it('AvatarSoul records an interaction on each conversation turn, through opts.listen', async () => {
    const { run, registered } = recordingRunner();
    boot.scheduleAvatar(run, { ...turnStarters(), listen: trackingListen });
    const soul = registered.find((s) => s.name === 'AvatarSoul');
    document.dispatchEvent(new Event('ferni:conversation-turn'));
    expect(recordInteraction).not.toHaveBeenCalled(); // no listener until the step runs
    await soul?.fn();

    expect(trackingListen).toHaveBeenCalledWith(
      document,
      'ferni:conversation-turn',
      expect.any(Function)
    );
    document.dispatchEvent(new Event('ferni:conversation-turn'));
    expect(recordInteraction).toHaveBeenCalledTimes(1);
    expect(recordInteraction).toHaveBeenCalledWith(0.5);
  });

  it('without opts.listen, AvatarSoul listens on document directly', async () => {
    const { run, registered } = recordingRunner();
    const add = vi.spyOn(document, 'addEventListener');
    boot.scheduleAvatar(run, turnStarters());
    document.dispatchEvent(new Event('ferni:conversation-turn'));
    expect(recordInteraction).not.toHaveBeenCalled(); // no listener until the step runs
    await registered.find((s) => s.name === 'AvatarSoul')?.fn();

    const call = add.mock.calls.find(([type]) => type === 'ferni:conversation-turn');
    expect(call).toBeDefined();
    if (call) added.push({ target: document, type: call[0], handler: call[1] as EventListener });
    document.dispatchEvent(new Event('ferni:conversation-turn'));
    expect(recordInteraction).toHaveBeenCalledTimes(1);
    expect(recordInteraction).toHaveBeenCalledWith(0.5);
  });

  it('bootAvatarNow runs CoachUI then ExpressiveEyes through run.now', async () => {
    const { run, registered } = recordingRunner();
    boot.bootAvatarNow(run);
    expect(registered.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'now', name: 'CoachUI' },
      { kind: 'now', name: 'ExpressiveEyes' },
    ]);
    for (const step of registered) await step.fn();
    expect(calls).toEqual(['initCoachUI', 'initExpressiveEyes']);
  });
});
