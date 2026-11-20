/**
 * Calm idle screen: with the calm-idle flag on (config/calm-idle.ts), the idle
 * screen is Ferni, one line and the talk button.
 *
 * This module only marks the page; styles/calm-idle.css does the hiding:
 * - `calm-idle` on <body> while the flag is on;
 * - `calm-idle--resting` while no call is running.
 * While resting, the avatar badge drops its "disconnected" state (a split heart,
 * the first thing a new person saw), the persona picker hides when it holds only
 * Ferni, and the rituals count badge hides. The name, role line, AI label and
 * helper line stay (the helper line also carries errors). All of it comes back
 * in a call.
 */

import { isCalmIdleOn } from '../config/calm-idle.js';
import { appState } from '../state/app.state.js';

export const CALM_IDLE_CLASS = 'calm-idle';
export const RESTING_CLASS = 'calm-idle--resting';

let unsubscribe: (() => void) | null = null;

/** Marks <body> for styles/calm-idle.css. Does nothing with the flag off. */
export function initCalmIdleScreen(): void {
  if (unsubscribe || !isCalmIdleOn()) return;
  document.body.classList.add(CALM_IDLE_CLASS);
  const apply = (state: string): void => {
    document.body.classList.toggle(RESTING_CLASS, state === 'disconnected');
  };
  apply(appState.get('connection'));
  unsubscribe = appState.subscribe('connection', apply);
}

/** Removes the marks (tests). */
export function disposeCalmIdleScreen(): void {
  unsubscribe?.();
  unsubscribe = null;
  document.body.classList.remove(CALM_IDLE_CLASS, RESTING_CLASS);
}
