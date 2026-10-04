/**
 * The Trust dashboard asks for "us" in the user's own time zone, and the
 * Insights tab's week / month toggle asks the server for that period.
 *
 * Before: health and insights were fetched with no time zone and no period, so
 * the server couldn't say "we mostly talk in the evenings" truthfully and the
 * week note was unreachable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet }));

const { setLocale } = await import('../../src/i18n/index.js');
const { showTrustDashboard, hideTrustDashboard } =
  await import('../../src/ui/trust-dashboard.ui.js');

const note = (period: 'week' | 'month') => ({
  hasData: true,
  period,
  latest: {
    period,
    daysTalked: 4,
    insights: [{ kind: 'timeOfDay', variant: 'evening', params: {}, evidence: ['s1', 's2', 's3'] }],
  },
  history: [],
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('trust dashboard: together tabs', () => {
  beforeEach(async () => {
    await setLocale('en-US', { reload: false });
    apiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/trust/insights')) {
        return {
          ok: true,
          status: 200,
          data: note(url.includes('period=week') ? 'week' : 'month'),
        };
      }
      return {
        ok: true,
        status: 200,
        data: { hasData: true, state: 'getting-started', score: null, factors: [], alerts: [] },
      };
    });
  });

  afterEach(() => {
    hideTrustDashboard();
    document.body.innerHTML = '';
    apiGet.mockReset();
  });

  it('asks in the user time zone, and the week button loads the week note', async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await showTrustDashboard();
    expect(apiGet).toHaveBeenLastCalledWith(`/api/trust/health?tz=${encodeURIComponent(tz)}`);
    expect(document.querySelector('.trust-dashboard-content')?.textContent).toContain(
      "We're just getting started"
    );

    document.querySelector<HTMLElement>('.tab-btn[data-tab="insights"]')?.click();
    await flush();
    expect(apiGet).toHaveBeenLastCalledWith(
      `/api/trust/insights?period=month&tz=${encodeURIComponent(tz)}`
    );
    expect(document.querySelector('.noticed-title')?.textContent).toBe(
      'Things I noticed this month'
    );

    document.querySelector<HTMLElement>('.noticed-period-btn[data-period="week"]')?.click();
    await flush();
    expect(apiGet).toHaveBeenLastCalledWith(
      `/api/trust/insights?period=week&tz=${encodeURIComponent(tz)}`
    );
    expect(document.querySelector('.noticed-title')?.textContent).toBe(
      'Things I noticed this week'
    );
    expect(
      document
        .querySelector('.noticed-period-btn[data-period="week"]')
        ?.getAttribute('aria-pressed')
    ).toBe('true');
    expect(document.querySelector('.noticed-list')?.textContent).toContain(
      'We mostly talk in the evenings.'
    );
  });
});
