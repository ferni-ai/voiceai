/**
 * Porch light at 2am: when a call starts in the caller's small hours (23:00 to
 * 04:59 on their own clock), a soft warm light comes up around the avatar,
 * like a lamp clicked on, and stays on for the call. Ferni's voice softens for
 * the same calls on the agent (PORCH_LIGHT, src/agents/personas/porch-light.ts).
 *
 * It only changes how the call looks: no overlay, nothing over the controls
 * (the halo sits inside .avatar-container and takes no pointer events), no
 * text. With prefers-reduced-motion the light is simply on, with no fade.
 * No known time zone: nothing happens.
 *
 * Off by default. Turn it on for a build with VITE_PORCH_LIGHT=true, or for one
 * browser with localStorage `ferni:flag:porch-light` = 'true' ('false' forces
 * it off for a build that has it on).
 *
 * @module ui/porch-light
 */

import { prefersReducedMotion } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PorchLight');

export const PORCH_LIGHT_STORAGE_KEY = 'ferni:flag:porch-light';
export const PORCH_LIGHT_LIT_CLASS = 'porch-light-on';

export function isPorchLightEnabled(): boolean {
  try {
    const override = localStorage.getItem(PORCH_LIGHT_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch (error) {
    log.debug('localStorage unavailable for porch light flag', { error: String(error) });
  }
  return import.meta.env.VITE_PORCH_LIGHT === 'true';
}

/** The browser's time zone, the same one the call's token sends the agent. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** True from 23:00 to 04:59 in `timeZone`; false when the zone is unknown or invalid. */
export function inQuietHours(now: Date, timeZone: string | undefined): boolean {
  if (!timeZone) return false;
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
        .formatToParts(now)
        .find((part) => part.type === 'hour')?.value
    );
    return hour >= 23 || hour < 5;
  } catch {
    return false;
  }
}

const PORCH_LIGHT_CSS = `
.porch-light__glow {
  position: absolute; inset: calc(var(--space-lg) * -1); border-radius: 50%;
  pointer-events: none; opacity: 0;
  background: radial-gradient(closest-side, var(--color-natural-highlight-glow) 52%,
    var(--color-semantic-warning-glow) 72%, transparent 100%);
  transition: opacity calc(var(--duration-slow) * 2) var(--ease-gentle);
}
.${PORCH_LIGHT_LIT_CLASS} > .porch-light__glow { opacity: 1; }
.porch-light__glow[data-motion='none'] { transition: none; }
@media (prefers-reduced-motion: reduce) { .porch-light__glow { transition: none; } }
`;

interface Options {
  now?: () => Date;
  timeZone?: () => string | undefined;
}

let host: HTMLElement | null = null;
let options: Required<Options> = { now: () => new Date(), timeZone: browserTimeZone };

function light(): void {
  if (!host || !inQuietHours(options.now(), options.timeZone())) return;
  let glow = host.querySelector<HTMLElement>('.porch-light__glow');
  if (!glow) {
    glow = document.createElement('div');
    glow.className = 'porch-light__glow';
    glow.setAttribute('aria-hidden', 'true');
    host.prepend(glow);
  }
  if (prefersReducedMotion()) glow.dataset.motion = 'none';
  else delete glow.dataset.motion;
  // Next frame, so the fade runs from off (a new element would otherwise start lit).
  void glow.offsetWidth;
  host.classList.add(PORCH_LIGHT_LIT_CLASS);
  log.debug('Porch light on for this call');
}

function unlight(): void {
  host?.classList.remove(PORCH_LIGHT_LIT_CLASS);
}

/** Starts listening for calls when the flag is on; returns whether it did. */
export function initPorchLight(opts: Options = {}): boolean {
  disposePorchLight();
  if (!isPorchLightEnabled()) return false;
  host = document.querySelector<HTMLElement>('.avatar-container');
  if (!host) {
    log.warn('Avatar not found; porch light not shown');
    return false;
  }
  options = { now: opts.now ?? (() => new Date()), timeZone: opts.timeZone ?? browserTimeZone };
  if (!document.getElementById('porch-light-styles')) {
    const style = document.createElement('style');
    style.id = 'porch-light-styles';
    style.textContent = PORCH_LIGHT_CSS;
    document.head.appendChild(style);
  }
  document.addEventListener('ferni:connected', light);
  document.addEventListener('ferni:disconnected', unlight);
  return true;
}

export function disposePorchLight(): void {
  document.removeEventListener('ferni:connected', light);
  document.removeEventListener('ferni:disconnected', unlight);
  unlight();
  // Every glow, so a hot reload never leaves a second one behind.
  document.querySelectorAll('.porch-light__glow').forEach((el) => el.remove());
  host = null;
}
