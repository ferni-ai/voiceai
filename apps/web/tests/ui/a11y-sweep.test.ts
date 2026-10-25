/**
 * Small accessibility fixes from the 2026-10-18 UI audit, one assertion each.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, status: 500, error: 'boom' })),
  apiPost: vi.fn(async () => ({ ok: false, status: 500, error: 'boom' })),
  getUserId: () => 'u1',
}));

const src = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('trust signals live region', () => {
  it('is role="status", since aria-label is not allowed on a plain div', async () => {
    const { initTrustSignals } = await import('../../src/ui/trust-signals.ui.js');
    initTrustSignals();
    const region = document.querySelector('.trust-signals-container');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('scroll areas a keyboard can reach', () => {
  it('Make It Yours list is a focusable, named region', async () => {
    const personalize = await import('../../src/ui/personalize.ui.js');
    personalize.open();
    const list = document.querySelector('.personalize-content');
    expect(list?.getAttribute('tabindex')).toBe('0');
    expect(list?.getAttribute('role')).toBe('region');
    expect(list?.getAttribute('aria-label')).toBeTruthy();
    personalize.close();
  });

  it("When We've Talked list is a focusable, named region", async () => {
    const { getConversationHistoryUI } = await import('../../src/ui/conversation-history.ui.js');
    getConversationHistoryUI().show({ sessions: [], totalSessions: 0, totalMinutes: 0, totalInsights: 0 } as never);
    const list = document.querySelector('.history__sessions');
    expect(list?.getAttribute('tabindex')).toBe('0');
    expect(list?.getAttribute('role')).toBe('region');
    expect(list?.getAttribute('aria-label')).toBeTruthy();
  });

  it('the shared modal content is a focusable region named by the title', () => {
    const modal = src('components/base/modal.ts');
    expect(modal).toContain('<div class="ferni-modal__content" tabindex="0" role="region" aria-labelledby="modal-title">');
  });
});

describe('Trust & Growth tab bar', () => {
  it('scrolls instead of clipping: tabs keep their width and the bar can scroll', () => {
    const css = src('ui/trust-dashboard.ui.ts');
    const bar = css.match(/\.trust-dashboard-tabs\s*\{([^}]*)\}/)?.[1] ?? '';
    const tab = css.match(/\.tab-btn\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(bar).toMatch(/overflow-x:\s*auto/);
    expect(bar).toMatch(/mask-image/);
    expect(tab).toMatch(/flex:\s*0 0 auto/);
  });
});

describe('Our Story So Far', () => {
  it('shows the stage percentage with the tagline, not drawn over it', () => {
    const story = src('ui/your-story-dashboard.ui.ts');
    expect(story).not.toMatch(/\.your-story__stage-progress::after\s*\{[^}]*content:\s*attr\(data-progress\)/);
    expect(story).toContain('stageTagline.textContent = `${data.stage.tagline} · ${progressPercent}%`');
  });

  it('stat cards use a themed surface, not the undefined glass token with a white fallback', () => {
    const story = src('ui/your-story-dashboard.ui.ts');
    const card = story.match(/\.your-story__stat\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(card).toContain('var(--color-background-elevated)');
    expect(card).not.toContain('--glass-thin-background');
  });
});

describe('menu icons', () => {
  it('The Sanctuary is not a terminal prompt, and When I\'ll Reach Out differs from What\'s Ahead', async () => {
    const { ANALYTICS_ICONS } = await import('../../src/ui/icons/shared-icons.js');
    const menu = src('ui/settings-menu.ui.ts');
    expect(menu).not.toContain('<path d="m4 17 6-6-6-6"/>');
    expect(menu).toContain('commands: ANALYTICS_ICONS.sunrise');
    expect(menu).toContain("renderMenuItem('outreach-schedule', ICONS.outreach");
    expect(menu).toContain("renderMenuItem('calendar-settings', ICONS.calendar");
    expect(ANALYTICS_ICONS.messageCircle).not.toBe(ANALYTICS_ICONS.calendar);
  });
});
