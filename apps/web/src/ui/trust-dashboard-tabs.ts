/**
 * Trust & Growth tab strip and the modal frame around it.
 *
 * - The modal has a fixed height and the content scrolls inside it. With a
 *   height that followed each tab's content, switching tabs re-centred the
 *   modal, the tab bar jumped, and the next click landed on the persona strip
 *   behind it (closing the modal and switching teammate).
 * - The strip is a WAI-ARIA tablist: arrow keys, Home and End move between
 *   tabs; only the selected tab is in the Tab order.
 * - When the six tabs don't fit (phones) the strip scrolls with no visible bar;
 *   a fade on the side that has more tabs says so.
 *
 * @module TrustDashboardTabs
 */

import { handleArrowNavigation } from '../utils/accessibility.js';

export const TRUST_PANEL_ID = 'trust-dashboard-panel';

/** Fade the edge(s) of the strip that hide more tabs. */
function updateEdgeFades(strip: HTMLElement): void {
  const more = strip.scrollWidth - strip.clientWidth;
  strip.classList.toggle('fade-start', more > 1 && strip.scrollLeft > 1);
  strip.classList.toggle('fade-end', more > 1 && strip.scrollLeft < more - 1);
}

/**
 * Make the dashboard's tab strip a tablist and call `onSelect` with the
 * chosen tab's `data-tab` when one is clicked (Enter and Space click a button).
 */
export function wireTrustTabs(root: HTMLElement, onSelect: (tab: string) => void): void {
  const strip = root.querySelector<HTMLElement>('.trust-dashboard-tabs');
  if (!strip) return;
  const tabs = Array.from(strip.querySelectorAll<HTMLElement>('.tab-btn'));
  const panel = root.querySelector<HTMLElement>('.trust-dashboard-content');
  panel?.setAttribute('role', 'tabpanel');
  if (panel) panel.id = TRUST_PANEL_ID;
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-labelledby', 'trust-dashboard-title');

  const mark = (selected: HTMLElement): void => {
    for (const tab of tabs) {
      const on = tab === selected;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
  };

  for (const tab of tabs) {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', TRUST_PANEL_ID);
    tab.addEventListener('click', () => {
      mark(tab);
      tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); // Safari doesn't focus a clicked button
      if (tab.dataset.tab) onSelect(tab.dataset.tab);
    });
  }
  mark(tabs.find((tab) => tab.classList.contains('active')) ?? tabs[0]!);

  handleArrowNavigation(strip, '.tab-btn', { orientation: 'horizontal' });
  // Bring a half-hidden tab fully into view when it gets focus (arrow keys, Tab, click)
  strip.addEventListener('focusin', (e) => {
    (e.target as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
  strip.addEventListener('scroll', () => updateEdgeFades(strip), { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => updateEdgeFades(strip)).observe(strip);
  updateEdgeFades(strip);
}

export const TRUST_TAB_STYLES = `
    .trust-dashboard-tabs {
      display: flex; flex-shrink: 0;
      gap: var(--space-1);
      padding: var(--space-2) var(--space-4);
      border-bottom: 1px solid var(--color-border);
      overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-inline: var(--space-4);
      scrollbar-width: none; /* the fade says it scrolls; a bar under six tabs is noise */
    }
    .trust-dashboard-tabs::-webkit-scrollbar { display: none; }
    .trust-dashboard-tabs.fade-end {
      -webkit-mask-image: linear-gradient(to right, black calc(100% - var(--space-8)), transparent);
      mask-image: linear-gradient(to right, black calc(100% - var(--space-8)), transparent);
    }
    .trust-dashboard-tabs.fade-start {
      -webkit-mask-image: linear-gradient(to left, black calc(100% - var(--space-8)), transparent);
      mask-image: linear-gradient(to left, black calc(100% - var(--space-8)), transparent);
    }
    .trust-dashboard-tabs.fade-start.fade-end {
      -webkit-mask-image: linear-gradient(to right, transparent, black var(--space-8), black calc(100% - var(--space-8)), transparent);
      mask-image: linear-gradient(to right, transparent, black var(--space-8), black calc(100% - var(--space-8)), transparent);
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 44px;
      padding: var(--space-2) var(--space-3);
      background: none;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      white-space: nowrap; flex: 0 0 auto; scroll-snap-align: start;
      transition: background-color var(--duration-fast), color var(--duration-fast);
    }
    .tab-btn svg { width: 16px; height: 16px; }
    .tab-btn:hover, .tab-btn:focus-visible {
      background: var(--color-background-hover);
      color: var(--color-text-secondary);
    }
    .tab-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: -2px; }
    .tab-btn.active {
      background: var(--persona-primary);
      color: var(--color-text-on-accent);
    }
    @media (prefers-reduced-motion: reduce) {
      .tab-btn { transition: none; }
    }
`;
