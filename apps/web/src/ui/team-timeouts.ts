/**
 * Team roster - tracked setTimeout helpers (cleared on dispose to prevent HMR leaks). Extracted from team.ui.ts.
 */

// FIX BUG: Track all setTimeout IDs for cleanup to prevent memory leaks
const activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

/**
 * Tracked setTimeout that automatically removes itself when done.
 * All timeouts are cleared on dispose() to prevent memory leaks during HMR.
 */
export function trackedTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  const id = setTimeout(() => {
    activeTimeouts.delete(id);
    callback();
  }, delay);
  activeTimeouts.add(id);
  return id;
}

/**
 * Clear a tracked timeout early (e.g., if animation is cancelled).
 */
function _clearTrackedTimeout(id: ReturnType<typeof setTimeout>): void {
  clearTimeout(id);
  activeTimeouts.delete(id);
}
void _clearTrackedTimeout; // Suppress unused warning - available for cleanup

/**
 * Clear all tracked timeouts (called on dispose).
 */
export function clearAllTrackedTimeouts(): void {
  for (const id of activeTimeouts) {
    clearTimeout(id);
  }
  activeTimeouts.clear();
}
