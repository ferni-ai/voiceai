/**
 * Trust & Growth tabs (2026-11-16 audit, item 9):
 * - switching tabs changed the modal's height, it re-centred, the tab bar
 *   jumped and the next click landed on the persona strip behind it;
 * - the tab strip showed a scrollbar and clipped "Insights", and had no
 *   keyboard model.
 *
 * jsdom has no layout, so the height contract is checked on the injected
 * stylesheet here; the measured positions across all six tabs are in the PR
 * evidence (Playwright at 883x828 and 375x812).
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn(async () => ({ ok: true, status: 200, data: { hasData: false } })));
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn(), getUserId: () => 'u1' }));

const { showTrustDashboard, hideTrustDashboard } = await import('../../src/ui/trust-dashboard.ui.js');

const tabs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.trust-dashboard-tabs .tab-btn')];
const selected = (): string[] => tabs().filter((b) => b.getAttribute('aria-selected') === 'true').map((b) => b.dataset.tab!);
const key = (el: Element, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
};
/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const css = document.getElementById('trust-dashboard-styles')?.textContent ?? '';
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
};

beforeEach(async () => {
  apiGet.mockClear();
  await showTrustDashboard();
});
afterEach(() => {
  hideTrustDashboard();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('Trust & Growth modal frame', () => {
  it('has a fixed height with the content scrolling inside, so a tab switch cannot move the tab bar', () => {
    const modal = rule('.trust-dashboard-modal');
    expect(modal).toMatch(/(^|;|\s)height:\s*min\(/);
    expect(rule('.trust-dashboard-content')).toMatch(/overflow-y:\s*auto/);
  });
});

describe('Trust & Growth tablist', () => {
  it('is a tablist with exactly one selected tab, the only one in the Tab order', () => {
    expect(document.querySelector('.trust-dashboard-tabs')?.getAttribute('role')).toBe('tablist');
    expect(tabs().every((b) => b.getAttribute('role') === 'tab')).toBe(true);
    expect(tabs().every((b) => b.getAttribute('aria-controls') === 'trust-dashboard-panel')).toBe(true);
    expect(document.getElementById('trust-dashboard-panel')?.getAttribute('role')).toBe('tabpanel');
    expect(selected()).toEqual(['health']);
    expect(tabs().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  });

  it('arrow keys, Home and End move focus along the tabs', () => {
    const [health, timeline] = tabs();
    health!.focus();
    key(health!, 'ArrowRight');
    expect(document.activeElement).toBe(timeline);
    key(timeline!, 'End');
    expect((document.activeElement as HTMLElement).dataset.tab).toBe('insights');
    key(document.activeElement!, 'ArrowRight'); // wraps
    expect(document.activeElement).toBe(health);
    key(health!, 'ArrowLeft');
    expect((document.activeElement as HTMLElement).dataset.tab).toBe('insights');
    key(document.activeElement!, 'Home');
    expect(document.activeElement).toBe(health);
  });

  it('selecting a tab moves the selection and loads that tab', async () => {
    const events = tabs().find((b) => b.dataset.tab === 'events')!;
    events.click();
    expect(selected()).toEqual(['events']);
    expect(events.tabIndex).toBe(0);
    await vi.waitFor(() => expect(apiGet.mock.calls.map(([url]) => String(url)).some((u) => u.includes('events'))).toBe(true));
  });
});
