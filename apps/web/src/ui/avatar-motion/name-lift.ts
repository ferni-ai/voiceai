/**
 * The name lift: the avatar's reaction when the caller names someone Ferni
 * remembers. The agent decides the kind (src/agents/realtime/name-lift.ts,
 * NAME_LIFT=on) and sends only that:
 * `humanization_signal { signalType: 'name_lift', effect }`.
 *
 * - brighten: good news about them. A warm bloom and the memory spark.
 * - attentive: something still pending. An attentive look, no sparkle.
 * - comfort: grief or conflict. A soft warm bloom and an empathetic look.
 *   Never the spark, never a sparkling expression.
 *
 * Writes no transform: the avatar body and ring each have one motion owner
 * (avatar compositor), so this uses only the soul overlays and the lids.
 * Never plays over something else (another lift, a comfort pulse, protective
 * mode, an open dialog, a hidden page). Under prefers-reduced-motion it is a
 * static warmth change on the container only. No sound.
 *
 * @module ui/avatar-motion/name-lift
 */

import { DURATION } from '../../config/animation-constants.js';
import { prefersReducedMotion } from '../../utils/accessibility.js';
import { createLogger } from '../../utils/logger.js';
import { ferniExpressions, type EmotionalExpression } from '../ferni-expressions.ui.js';

const log = createLogger('NameLift');

export type NameLiftEffect = 'brighten' | 'attentive' | 'comfort';

/** Set on `.avatar-container` while a lift shows; its value is the effect. */
export const NAME_LIFT_ATTR = 'data-name-lift';
/** How long the look and the reduced-motion warmth hold. */
export const NAME_LIFT_HOLD_MS = DURATION.GLACIAL * 2;
const STYLE_ID = 'name-lift-styles';

/** Static, so reduced motion gets a warmth change and nothing that moves. */
export const NAME_LIFT_CSS = `
.avatar-container[${NAME_LIFT_ATTR}] { transition: none; filter: sepia(0.18) saturate(1.12); }
.avatar-container[${NAME_LIFT_ATTR}='attentive'] { filter: sepia(0.1); }
.avatar-container[${NAME_LIFT_ATTR}='comfort'] { filter: sepia(0.22) saturate(0.95); }
`;

const EXPRESSION: Record<NameLiftEffect, EmotionalExpression> = {
  brighten: 'warm',
  attentive: 'attentive',
  comfort: 'empathetic',
};

/** The slice of the avatar soul this needs. */
export interface NameLiftSoul {
  triggerWarmthBloom(intensity?: number, color?: string): void;
  triggerMemorySpark(): void;
  getState(): { comfortPulseActive: boolean; protectiveMode: boolean };
}

export interface NameLiftDeps {
  soul: () => Promise<NameLiftSoul | null | undefined>;
  express: (expression: EmotionalExpression, transitionMs: number, holdMs: number) => void;
  reducedMotion: () => boolean;
  container: () => HTMLElement | null;
  schedule: (fn: () => void, delayMs: number) => void;
}

export function nameLiftEffectFrom(value: unknown): NameLiftEffect | null {
  return value === 'brighten' || value === 'attentive' || value === 'comfort' ? value : null;
}

/** True when a lift would cover something already showing. */
function covered(container: HTMLElement | null, soul: NameLiftSoul | null | undefined): boolean {
  if (!container?.isConnected || document.hidden) return true;
  if (container.hasAttribute(NAME_LIFT_ATTR)) return true;
  if (document.querySelector('dialog[open], [aria-modal="true"]')) return true;
  const state = soul?.getState();
  return Boolean(state?.comfortPulseActive || state?.protectiveMode);
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = NAME_LIFT_CSS;
  document.head.appendChild(style);
}

/** Play one lift. Resolves to whether anything was shown. */
export async function runNameLift(effect: NameLiftEffect, deps: NameLiftDeps): Promise<boolean> {
  const soul = await deps.soul();
  const container = deps.container();
  if (!container || covered(container, soul)) return false;
  ensureStyles();
  container.setAttribute(NAME_LIFT_ATTR, effect);
  deps.schedule(() => container.removeAttribute(NAME_LIFT_ATTR), NAME_LIFT_HOLD_MS);
  if (deps.reducedMotion()) return true;
  deps.express(EXPRESSION[effect], DURATION.MODERATE, NAME_LIFT_HOLD_MS);
  if (effect === 'brighten') {
    soul?.triggerWarmthBloom(1);
    soul?.triggerMemorySpark();
  } else if (effect === 'comfort') {
    soul?.triggerWarmthBloom(0.8);
  }
  return true;
}

const liveDeps: NameLiftDeps = {
  // Loaded on first use, like the EQ bridge does, so the soul never loads in a cycle.
  soul: async () => (await import('../avatar-soul.ui.js')).avatarSoul,
  express: (expression, transitionMs, holdMs) =>
    ferniExpressions.setExpression(expression, transitionMs, holdMs),
  reducedMotion: prefersReducedMotion,
  container: () => document.querySelector<HTMLElement>('.avatar-container'),
  schedule: (fn, delayMs) => {
    setTimeout(fn, delayMs);
  },
};

/** Handle a `name_lift` humanization signal. Unknown effects are ignored. */
export function playNameLift(signal: { effect?: unknown }, deps: NameLiftDeps = liveDeps): void {
  const effect = nameLiftEffectFrom(signal.effect);
  if (!effect) return;
  runNameLift(effect, deps).catch((error: unknown) =>
    log.warn('Name lift failed', { effect, error: String(error) })
  );
}
