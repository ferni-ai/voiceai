/**
 * What I'm Noticing: with no insights yet it says what will appear, and never
 * shows an invented sample as if it were about the user.
 *
 * Before: "You've mentioned feeling tired 8 times this week..." / "Based on 23
 * conversations", and "Sunday evenings seem hard for you..." as a capability
 * line. A failed load showed the same empty state.
 */

import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet }));
vi.mock('../../src/ui/better-than-human.ui.js', () => ({ playMicroExpression: vi.fn() }));

const { getInsightsView } = await import('../../src/ui/insights-view.ui.js');
const { t } = await import('../../src/i18n/index.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
const contentText = () => document.getElementById('insights-content')?.textContent ?? '';

// The view is a singleton that keeps its element and setup.ts empties the body
// before each test, so both states are checked in one test.
describe("What I'm Noticing", () => {
  it('describes what will appear with no sample insight, and says so when the load fails', async () => {
    getInsightsView().initialize();

    expect(contentText()).toContain(t('insightsView.emptyNote'));
    expect(contentText()).not.toMatch(/tired 8 times|23 conversations|Sunday evenings/);

    localStorage.setItem('ferni_user_id', 'u1');
    apiGet.mockResolvedValue({ ok: false, status: 500 });
    getInsightsView().show();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('/api/insights/u1');
    expect(contentText()).toContain(t('insightsView.loadFailed'));
    expect(contentText()).not.toContain(t('insightsView.emptyNote'));
    localStorage.clear();
  });
});
