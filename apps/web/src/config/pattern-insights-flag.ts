/**
 * Your Patterns flag. Off by default.
 *
 * The panel has no data path yet: GET /api/insights/patterns runs
 * extractLearnedMemories, a stub that returns nothing, and replies with
 * `patterns` while the panel reads `insights`. So everyone saw the same fixed
 * "Welcome" card forever. While off, the menu item is hidden and nothing opens
 * the panel (menu, voice "show my patterns"). Turn it on with
 * `VITE_PATTERN_INSIGHTS=true` once the server returns real patterns.
 */
export function isPatternInsightsOn(): boolean {
  return import.meta.env.VITE_PATTERN_INSIGHTS === 'true';
}
