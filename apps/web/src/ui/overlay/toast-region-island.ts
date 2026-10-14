/**
 * Phone toasts stack under the status island when it shows something
 * (overlay plan §2.3). Both sit at the same top offset, so without this the
 * toast covers the island's pill. Desktop toasts are top-right and unaffected.
 *
 * The island (`.status-island`, always in the page) is a flex column whose
 * pills come and go, so "visible" means it has a rendered size. A
 * ResizeObserver follows it; the region also re-checks on every toast.
 *
 * @module ui/overlay/toast-region-island
 */

const PHONE_QUERY = '(max-width: 768px)';

/** The region's top on a phone below a visible island, or null for the normal offset. */
export function islandOffset(island: Element | null): string | null {
  if (!island || !window.matchMedia?.(PHONE_QUERY).matches) return null;
  const rect = island.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return `calc(${Math.round(rect.bottom)}px + var(--overlay-gap, 0.5rem))`;
}

export function placeBelowIsland(root: HTMLElement): void {
  const top = islandOffset(document.querySelector('.status-island'));
  if (top) root.style.top = top;
  else root.style.removeProperty('top');
}

/** Keep the region under the island while it resizes; returns a stop function. */
export function followStatusIsland(root: HTMLElement): () => void {
  placeBelowIsland(root);
  const island = document.querySelector('.status-island');
  if (!island || typeof ResizeObserver === 'undefined') return () => undefined;
  const observer = new ResizeObserver(() => placeBelowIsland(root));
  observer.observe(island);
  return () => observer.disconnect();
}
