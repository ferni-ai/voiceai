/**
 * The BTH Validation section against faked server answers shaped like
 * src/api/v1/admin/better-than-human-analytics.ts sends them: benchmark rows and gaps
 * from one benchmark request, the synthetic label, failures as "unavailable (HTTP n)"
 * and never zeros, the no-events sentence, and what each action button requests (#4069).
 * No request leaves the test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: (url: string, init?: RequestInit) => fetchMock(url, init),
}));

const BENCHMARK = '/api/v1/admin/bth/validation/benchmark';
const TELEMETRY = '/api/v1/admin/bth/validation/telemetry';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const capability = (name: string, f1Score: number, gaps: unknown[] = []) => ({
  capability: name,
  runAt: '2026-11-18T09:00:00.000Z',
  totalTestCases: 20,
  truePositives: 9,
  trueNegatives: 8,
  falsePositives: 1,
  falseNegatives: 2,
  precision: 0.9,
  recall: 0.818,
  f1Score,
  accuracy: 0.85,
  trend: 'stable',
  knownGaps: gaps,
});

const BENCHMARK_BODY = {
  results: {
    reportId: 'bth_1',
    generatedAt: '2026-11-18T09:00:00.000Z',
    capabilities: [
      capability('commitment_detection', 0.857, [
        {
          category: 'hedged_promise',
          examples: ['I might try to call Pat on Friday'],
          priority: 'medium',
        },
      ]),
      capability('reading_between_lines', 0.612),
    ],
    overallF1Score: 0.7345,
    overallAccuracy: 0.85,
    hasRegressions: false,
    regressions: [],
    improvements: [],
  },
  report: 'text report',
  timestamp: '2026-11-18T09:00:01.000Z',
};

const TELEMETRY_BODY = {
  periodDays: 7,
  entries: [
    {
      capability: 'commitment_detection',
      totalTriggers: 41,
      uniqueUsers: 6,
      acknowledgmentRate: null,
      engagementRate: null,
      averageConfidence: 0.77,
    },
  ],
  buffer: { bufferedEvents: 0, capabilityBreakdown: {}, recentTriggers: 0 },
  timestamp: '2026-11-18T09:00:02.000Z',
};

function serve(routes: Record<string, () => Response>): void {
  fetchMock.mockImplementation(async (url) => {
    const route = routes[url];
    if (!route) throw new Error(`unexpected request ${url}`);
    return route();
  });
}

const requestsTo = (url: string): number => fetchMock.mock.calls.filter(([u]) => u === url).length;

/** Renders the section into a content area and binds it, as the portal does. */
async function mount(): Promise<HTMLElement> {
  const section = await import('../../src/admin/sections/BTHValidationSection.js');
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = await section.render();
  section.setupEvents(root);
  return root;
}

/** The section's handlers read the held data asynchronously: let them finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function clickTab(root: HTMLElement, tab: string): Promise<void> {
  root.querySelector<HTMLElement>(`.bth-tab[data-tab="${tab}"]`)?.click();
  await settle();
}

describe('BTHValidationSection', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders benchmark rows from the server shape, labelled synthetic', async () => {
    serve({ [BENCHMARK]: () => json(BENCHMARK_BODY), [TELEMETRY]: () => json(TELEMETRY_BODY) });
    const root = await mount();
    const text = root.textContent ?? '';

    expect(text).toContain(
      'Synthetic benchmark: 40 fixed test cases in code, not production traffic.'
    );
    expect(text).toContain(`Run ${new Date('2026-11-18T09:00:00.000Z').toLocaleString()}.`);
    const values = [...root.querySelectorAll('.bth-stat-value')].map((v) => v.textContent?.trim());
    expect(values).toEqual(['73.5%', '1', '2', '41']);

    const rows = [...root.querySelectorAll('.bth-table tbody tr')];
    expect(rows).toHaveLength(2);
    const first = [...rows[0].querySelectorAll('td')].map((td) => td.textContent?.trim());
    expect(first).toEqual([
      'commitment_detection',
      '20',
      '9',
      '1',
      '2',
      '8',
      '90.0%',
      '81.8%',
      '85.7%',
    ]);
  });

  it('renders the gaps from the benchmark response, with one benchmark request per load', async () => {
    serve({ [BENCHMARK]: () => json(BENCHMARK_BODY), [TELEMETRY]: () => json(TELEMETRY_BODY) });
    const root = await mount();
    await clickTab(root, 'gaps');
    await clickTab(root, 'telemetry');
    await clickTab(root, 'gaps');

    const gap = root.querySelector('.bth-gap-category')?.textContent ?? '';
    expect(gap).toContain('hedged_promise');
    expect(gap).toContain('commitment_detection');
    expect(gap).toContain('medium priority');
    expect(gap).toContain('I might try to call Pat on Friday');
    expect(root.querySelector('.bth-tab[data-tab="gaps"]')?.textContent).toContain('Gaps (1)');

    expect(requestsTo(BENCHMARK)).toBe(1);
    expect(requestsTo(TELEMETRY)).toBe(1);
    expect(fetchMock.mock.calls.map(([u]) => u)).not.toContain('/api/v1/admin/bth/validation/gaps');
  });

  it('shows a failed request as unavailable (HTTP 500), never zeros or Never', async () => {
    serve({
      [BENCHMARK]: () => json({ error: 'Internal server error' }, 500),
      [TELEMETRY]: () => json({ error: 'Internal server error' }, 500),
    });
    const root = await mount();
    const values = [...root.querySelectorAll('.bth-stat-value')].map((v) => v.textContent?.trim());
    expect(values).toEqual(Array(4).fill('unavailable (HTTP 500)'));

    for (const tab of ['benchmarks', 'gaps', 'telemetry']) {
      await clickTab(root, tab);
      expect(root.querySelector('.bth-tab-content')?.textContent).toContain(
        'unavailable (HTTP 500)'
      );
    }
    root.querySelectorAll('style').forEach((style) => style.remove()); // CSS has numbers
    const rest = (root.textContent ?? '').replaceAll('unavailable (HTTP 500)', '');
    expect(rest).not.toMatch(/\b\d/); // a number, not the "1" in "F1"
    expect(rest).not.toContain('Never');
  });

  it('says there were no production events when telemetry is empty', async () => {
    serve({
      [BENCHMARK]: () => json(BENCHMARK_BODY),
      [TELEMETRY]: () => json({ ...TELEMETRY_BODY, entries: [] }),
    });
    const root = await mount();
    await clickTab(root, 'telemetry');
    expect(root.querySelector('.bth-tab-content')?.textContent).toContain(
      'No production events in the last 7 days.'
    );
  });

  it('shows unmeasured reply rates as not measured, and the measured values', async () => {
    serve({ [BENCHMARK]: () => json(BENCHMARK_BODY), [TELEMETRY]: () => json(TELEMETRY_BODY) });
    const root = await mount();
    await clickTab(root, 'telemetry');
    const cells = [...root.querySelectorAll('.bth-tab-content tbody td')].map((td) =>
      td.textContent?.trim()
    );
    expect(cells).toEqual([
      'commitment_detection',
      '41',
      '6',
      'not measured',
      'not measured',
      '77.0%',
    ]);
  });

  it('Run Benchmark makes one benchmark request and redraws with its result', async () => {
    let f1 = 0.7345;
    serve({
      [BENCHMARK]: () =>
        json({ ...BENCHMARK_BODY, results: { ...BENCHMARK_BODY.results, overallF1Score: f1 } }),
      [TELEMETRY]: () => json(TELEMETRY_BODY),
    });
    const root = await mount();
    f1 = 0.9;
    root.querySelector<HTMLButtonElement>('[data-action="run-benchmark"]')?.click();
    await vi.waitFor(() =>
      expect(root.querySelector('.bth-stat-value')?.textContent?.trim()).toBe('90.0%')
    );
    expect(requestsTo(BENCHMARK)).toBe(2);
    expect(requestsTo(TELEMETRY)).toBe(1);
  });

  it('Refresh Telemetry requests only telemetry and opens its tab', async () => {
    let entries = TELEMETRY_BODY.entries;
    serve({
      [BENCHMARK]: () => json(BENCHMARK_BODY),
      [TELEMETRY]: () => json({ ...TELEMETRY_BODY, entries }),
    });
    const root = await mount();
    entries = [];
    root.querySelector<HTMLButtonElement>('[data-action="refresh-telemetry"]')?.click();
    await vi.waitFor(() =>
      expect(root.querySelector('.bth-tab-content')?.textContent).toContain(
        'No production events in the last 7 days.'
      )
    );
    expect(root.querySelector('.bth-tab--active')?.getAttribute('data-tab')).toBe('telemetry');
    expect(requestsTo(TELEMETRY)).toBe(2);
    expect(requestsTo(BENCHMARK)).toBe(1);
  });

  it('Export Report downloads what the section loaded', async () => {
    serve({ [BENCHMARK]: () => json(BENCHMARK_BODY), [TELEMETRY]: () => json(TELEMETRY_BODY) });
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:report';
    });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const root = await mount();

    root.querySelector<HTMLButtonElement>('[data-action="export-report"]')?.click();
    await settle();
    expect(click).toHaveBeenCalledTimes(1);
    const report = JSON.parse(await blobs[0].text()) as Record<string, unknown>;
    expect(report.benchmark).toEqual(BENCHMARK_BODY);
    expect(report.telemetry).toEqual(TELEMETRY_BODY);
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
