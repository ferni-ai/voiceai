/**
 * The avatar's boot, in one place. The app (`app.ts` initializeUI) and the
 * admin avatar lab both run it, so the lab shows exactly what users get.
 *
 * Each step keeps the name and delay it had in app.ts, and the deferred steps
 * keep their dynamic imports so the bundle's chunks are unchanged. The caller
 * supplies the runner (the app adapts its safeInit/deferredInit) and how turn
 * following starts (the app needs LiveKit for it; the lab does not).
 */
import { initAvatarFeedback } from './avatar-feedback.ui.js';
import { initCoachUI } from './coach.ui.js';
import { initExpressiveEyes } from './expressive-eyes.ui.js';
import { initThinkingUI } from './thinking.ui.js';

export interface AvatarBootRunner {
  now(name: string, fn: () => void | Promise<void>): void;
  later(name: string, delayMs: number, fn: () => void | Promise<void>): void;
}

export interface AvatarBootOptions {
  /** Starts turn following; returns whether turns are active (app: initSpeakerCues + initAvatarTurns). */
  startTurns: () => boolean | Promise<boolean>;
  /** Adds a listener the caller removes on teardown (app: addTrackedListener). Default: target.addEventListener. */
  listen?: (target: EventTarget, type: string, handler: EventListener) => void;
}

interface AvatarBootStep {
  name: string;
  delayMs: number;
  run: (opts: AvatarBootOptions) => void | Promise<void>;
}

const STEPS: readonly AvatarBootStep[] = [
  {
    name: 'ThinkingUI',
    delayMs: 100,
    run: async (opts) => {
      initThinkingUI();
      const turnsActive = await opts.startTurns(); // turns on unless ferni:avatar-turns=off
      // gestures need ferni:turn-gestures
      (await import('./avatar-motion/turn-gestures.js')).initTurnGestures(turnsActive);
      (await import('./avatar-motion/natural-blink.js')).initNaturalBlink(); // off unless ferni:natural-blink
    },
  },
  {
    name: 'AvatarFeedback',
    delayMs: 100,
    run: () => {
      initAvatarFeedback();
    },
  },
  {
    name: 'PresenceUI',
    delayMs: 300,
    run: async () => {
      (await import('./presence.ui.js')).initPresenceUI();
    },
  },
  {
    name: 'AvatarTapReactionsUI', // tap the avatar for laugh/wink reactions
    delayMs: 400,
    run: async () => {
      (await import('./avatar-tap-reactions.ui.js')).initAvatarTapReactionsUI();
    },
  },
  {
    name: 'FerniExpressions',
    delayMs: 300,
    run: async () => {
      (await import('./ferni-expressions.ui.js')).initFerniExpressions();
    },
  },
  {
    name: 'EmotionExpressionBridge',
    delayMs: 400,
    run: async () => {
      (await import('../emotion/emotion-expression-bridge.js')).enableEmotionExpressionBridge();
    },
  },
  {
    name: 'LogoExpressions',
    delayMs: 400,
    run: async () => {
      const { initLogoExpressions, hookIntoAvatarFeedback } =
        await import('./logo-expressions.ui.js');
      initLogoExpressions();
      hookIntoAvatarFeedback();
    },
  },
  {
    name: 'AvatarSoul',
    delayMs: 600,
    run: async (opts) => {
      const { initAvatarSoul, avatarSoul } = await import('./avatar-soul.ui.js');
      initAvatarSoul();
      const listen =
        opts.listen ??
        ((target: EventTarget, type: string, handler: EventListener) =>
          target.addEventListener(type, handler));
      listen(document, 'ferni:conversation-turn', () => {
        avatarSoul.recordInteraction(0.5);
      });
    },
  },
  {
    name: 'AvatarLamp',
    delayMs: 700,
    run: async () => {
      const { initAvatarLamp, avatarLamp } = await import('./avatar-lamp.ui.js');
      initAvatarLamp();
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__avatarLamp = avatarLamp;
      }
    },
  },
  {
    name: 'AmbientLife',
    delayMs: 800,
    run: async () => {
      (await import('./ambient-life.ui.js')).initAmbientLife();
    },
  },
];

/** Name and delay of every deferred avatar init, in registration order. */
export const AVATAR_BOOT_STEPS: readonly { name: string; delayMs: number }[] = STEPS.map(
  ({ name, delayMs }) => ({ name, delayMs })
);

/** Coach and expressive eyes, run where app.ts ran them (before roster/team/controls). */
export function bootAvatarNow(run: AvatarBootRunner): void {
  run.now('CoachUI', () => initCoachUI());
  run.now('ExpressiveEyes', () => initExpressiveEyes()); // Pixar-style eye expressions
}

/** Every deferred avatar init, each at its existing delay. */
export function scheduleAvatar(run: AvatarBootRunner, opts: AvatarBootOptions): void {
  for (const step of STEPS) run.later(step.name, step.delayMs, () => step.run(opts));
}
