/**
 * Panel openers: the `ferni:open-<panel>` listeners for panels that
 * config/menu-visibility.ts can hide.
 *
 * Every listener here asks menu-visibility first, so a hidden panel opens
 * from no path: not the menu, not a voice `show_view`, not a notification,
 * not the bottom sheet or the dev panel. Before (2026-10-25 menu audit) these
 * listeners opened their panel unconditionally and were safe only because
 * every dispatcher happened to check.
 */

import { isPanelEventVisible } from '../config/menu-visibility.js';

/** The events this module answers. Each names a panel menu-visibility can hide. */
export const GATED_PANEL_EVENTS = [
  'ferni:open-patterns',
  'ferni:open-quiz',
  'ferni:open-music',
  'ferni:open-household',
  'ferni:open-voice-id',
  'ferni:open-predictions',
  'ferni:open-marketplace',
] as const;

export type GatedPanelEvent = (typeof GATED_PANEL_EVENTS)[number];

/** A listener that runs `open` only while the event's panel is visible. */
export function gatedPanelListener(eventName: GatedPanelEvent, open: () => void): EventListener {
  return () => {
    if (isPanelEventVisible(eventName)) open();
  };
}

/** Registers one gated listener per event, through the caller's `add` (app.ts tracks its listeners). */
export function bindPanelOpeners(
  add: (eventName: GatedPanelEvent, listener: EventListener) => void,
  openers: Readonly<Record<GatedPanelEvent, () => void>>
): void {
  for (const eventName of GATED_PANEL_EVENTS) {
    add(eventName, gatedPanelListener(eventName, openers[eventName]));
  }
}
