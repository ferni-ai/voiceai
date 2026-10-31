/**
 * Menu visibility: the one place that decides which menu rows render.
 *
 * Every surface that offers a way into a panel asks here first: the desktop
 * settings menu (including pinned rows), the mobile bottom sheet, the
 * "Everything Connected" tiles, and the deep links (voice `show_view`,
 * notification `?panel=` and notification types). A hidden item renders
 * nowhere and its deep links do nothing.
 *
 * Seth's decisions (2026-10-12 menu program, confirmed 2026-10-17: "drop the
 * locks, cut seeds, go ahead on the rest"). The reasons are from the
 * 2026-10-17 menu audit; un-hide an item only once its reason is gone.
 */

import { isPatternInsightsOn } from './pattern-insights-flag.js';

/** Settings-menu rows (their `data-action`) that never render. */
const HIDDEN_MENU_ACTIONS: ReadonlySet<string> = new Set([
  // Set the Mood: no lights or thermostat credentials in prod
  'vibe-controller',
  'smart-home',
  // Meet More Friends: no marketplace agent has a real persona bundle
  'discover-agents',
  // Home & Family and Recognizing You: need a speaker-ID pipeline nobody calls
  'household',
  'household-members',
  'voice-enrollment',
  'voice-id-settings',
  // Music Together: buttons wired to nothing, invented "DNA" numbers
  'music-dashboard',
  // Knowledge Quiz: never asks a memory question
  'knowledge-quiz',
  // Build a Ritual: write-only, rituals are never read back
  'ritual',
  // What's Coming: roadmap votes, a network error counts as a vote
  'whats-growing',
  // Predictions: the tool behind it isn't in the prod tool set
  'predictions',
  // Integrations without prod credentials
  'oura-settings',
  'apple-health-settings',
  'wearable-settings',
]);

/** Rows and panels that show only while their flag is on. */
const FLAGGED: Readonly<Record<string, () => boolean>> = {
  // Your Patterns: no data path yet (config/pattern-insights-flag.ts)
  'pattern-insights': isPatternInsightsOn,
  'conversation-insights': isPatternInsightsOn,
  patterns: isPatternInsightsOn,
};

function flagAllows(id: string): boolean {
  return Object.hasOwn(FLAGGED, id) ? (FLAGGED[id] as () => boolean)() : true;
}

/** Mobile bottom-sheet actions that never render. */
const HIDDEN_SHEET_ACTIONS: ReadonlySet<string> = new Set(['music']);

/**
 * Panels that nothing may open: the `ferni:open-<panel>` events a deep link
 * would dispatch, and the panel names a voice `show_view` or `?panel=` uses.
 */
const HIDDEN_PANELS: ReadonlySet<string> = new Set([
  'music',
  'quiz',
  'household',
  'household-members',
  'voice-id',
  'marketplace',
  'predictions',
  'roadmap',
]);

/**
 * "Everything Connected" tiles that never render. Google Calendar stays: it
 * has prod credentials. The Vibe tile always claimed "connected".
 */
const HIDDEN_INTEGRATIONS: ReadonlySet<string> = new Set([
  'apple-health',
  'oura',
  'wearables',
  'ecobee',
  'vibe-controller',
]);

/** Every settings-menu row hidden right now, flagged-off rows included (for the hide tests). */
export function hiddenMenuActions(): string[] {
  const flaggedOff = Object.keys(FLAGGED).filter((id) => !flagAllows(id));
  return [...HIDDEN_MENU_ACTIONS, ...flaggedOff];
}

/** True when a settings-menu row with this action may render. */
export function isMenuActionVisible(action: string): boolean {
  return !HIDDEN_MENU_ACTIONS.has(action) && flagAllows(action);
}

/** True when a mobile bottom-sheet action with this id may render. */
export function isSheetActionVisible(id: string): boolean {
  return !HIDDEN_SHEET_ACTIONS.has(id);
}

/** True when a panel (by name, e.g. "music") may be opened from a deep link. */
export function isPanelVisible(panel: string): boolean {
  return !HIDDEN_PANELS.has(panel) && flagAllows(panel);
}

/** True when a `ferni:open-<panel>` event may open its panel. */
export function isPanelEventVisible(eventName: string): boolean {
  const prefix = 'ferni:open-';
  return !eventName.startsWith(prefix) || isPanelVisible(eventName.slice(prefix.length));
}

/** True when an "Everything Connected" tile may render. */
export function isIntegrationVisible(id: string): boolean {
  return !HIDDEN_INTEGRATIONS.has(id);
}

/**
 * The "Everything Connected" tiles by tab, minus the hidden tiles and any tab
 * the hides left empty.
 */
export function visibleIntegrations<K extends string, T extends { id: string }>(
  byTab: Record<K, T[]>
): Partial<Record<K, T[]>> {
  const visible: Partial<Record<K, T[]>> = {};
  for (const tab of Object.keys(byTab) as K[]) {
    const tiles = byTab[tab].filter((tile) => isIntegrationVisible(tile.id));
    if (tiles.length > 0) visible[tab] = tiles;
  }
  return visible;
}
