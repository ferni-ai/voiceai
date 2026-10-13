/**
 * Whether the dev tools (the dev panel and the insights/trigger debug panels)
 * may turn on in this page load.
 *
 * Mirrors dev-panel.ui.ts: dev builds, admin builds with VITE_DEV_PANEL_AUTO,
 * or `?dev=<VITE_DEV_PANEL_KEY>` when the build has a key. A bare `?dev` on a
 * production build is not enough, so production visitors never download the
 * dev panel's 712 KB chunk or get the debug panel shortcuts.
 */
export function devPanelMayEnable(
  env: { DEV?: boolean; VITE_DEV_PANEL_AUTO?: string; VITE_DEV_PANEL_KEY?: string } = import.meta.env,
  search: string = window.location.search
): boolean {
  if (env.DEV === true || env.VITE_DEV_PANEL_AUTO === 'true') return true;
  const key = env.VITE_DEV_PANEL_KEY;
  return Boolean(key) && new URLSearchParams(search).get('dev') === key;
}
