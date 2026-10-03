/**
 * Whether the dev panel could turn on in this page load.
 *
 * The panel makes the final decision itself (dev-panel.ui.ts checks the admin
 * key). This mirrors its rules loosely so production visitors, who can never
 * enable it, skip downloading its 712 KB chunk.
 */
export function devPanelMayEnable(
  env: { DEV?: boolean; VITE_DEV_PANEL_AUTO?: string } = import.meta.env,
  search: string = window.location.search
): boolean {
  if (env.DEV === true || env.VITE_DEV_PANEL_AUTO === 'true') return true;
  return new URLSearchParams(search).has('dev');
}
