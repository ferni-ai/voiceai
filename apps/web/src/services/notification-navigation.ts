/**
 * Notification Navigation
 *
 * Where a push notification takes you. The service worker (public/sw.js)
 * sends a click to an open window as a message carrying the notification's
 * data, or opens a new window at `/?panel=<name>`; both end up here, and both
 * resolve to the same `ferni:open-*` events the app already listens for.
 */

type PanelName = 'engagement' | 'predictions' | 'huddle' | 'analytics';

const PANEL_EVENTS: Record<PanelName, string> = {
  engagement: 'ferni:open-engagement',
  predictions: 'ferni:open-predictions',
  huddle: 'ferni:open-team-huddle',
  analytics: 'ferni:open-analytics',
};

/** Notification type (the `type` in push data) to the panel it opens. */
const TYPE_PANELS = new Map<string, PanelName>([
  ['ritual_reminder', 'engagement'],
  ['prediction_result', 'predictions'],
  ['team_huddle', 'huddle'],
  ['streak_milestone', 'analytics'],
]);

function openPanel(panel: PanelName): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS[panel]));
}

/** Open the panel a notification of this type points at. False when it points at none. */
export function openPanelForNotificationType(type: string | undefined): boolean {
  const panel = TYPE_PANELS.get(type ?? '');
  if (!panel) return false;
  openPanel(panel);
  return true;
}

/**
 * Open the panel named by `?panel=` (a notification opened a fresh window),
 * then drop the parameter so a reload doesn't open it again.
 */
export function openPanelFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('panel');
  if (!name) return false;

  params.delete('panel');
  const search = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (search ? `?${search}` : '') + window.location.hash);

  const panel = (Object.keys(PANEL_EVENTS) as PanelName[]).find((known) => known === name);
  if (!panel) return false;
  openPanel(panel);
  return true;
}
