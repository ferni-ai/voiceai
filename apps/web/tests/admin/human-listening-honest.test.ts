/**
 * Human Listening never draws a missing value as data (#4069). A failed request,
 * a server that holds no listening signal, and a body of the wrong shape each say
 * why there is nothing, instead of zeros, "Low", "0%", an empty table or "No
 * active sessions". The section's three routes are answered per test; no request
 * leaves the test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-api.js', () => ({
  getAdminHeadersAsync: () => Promise.resolve({}),
}));

const { render } = await import('../../src/admin/sections/HumanListeningSection.js');
const { metricsFrom } = await import('../../src/admin/sections/human-listening-data.js');

type Answer = { status?: number; body?: unknown; reject?: boolean };

function serve(answers: { metrics?: Answer; signals?: Answer; live?: Answer }): void {
  vi.stubGlobal('fetch', (url: string) => {
    const route = url.split('/').pop() as 'metrics' | 'signals' | 'live';
    const answer = answers[route] ?? { body: [] };
    if (answer.reject) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(
      new Response(JSON.stringify(answer.body ?? null), { status: answer.status ?? 200 })
    );
  });
}

afterEach(() => vi.unstubAllGlobals());

const MEASURED = {
  measured: true,
  windowHours: 24,
  totalSessions: 3,
  distressDetections: 1,
  avgCognitiveLoad: 0.6,
  avgEngagement: 0.5,
  selfSoothingDetections: 2,
  hedgingDetections: 4,
  tremorDetections: 0,
  energyFadeDetections: 5,
};

async function section(): Promise<HTMLElement> {
  const el = document.createElement('div');
  el.innerHTML = await render();
  return el;
}

const tiles = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('.listening-stat-value, .detection-card-count')].map(
    (t) => t.textContent?.trim() ?? ''
  );
const live = (el: HTMLElement): string =>
  el.querySelector('.live-sessions-grid')?.textContent ?? '';
const signalRows = (el: HTMLElement): string =>
  el.querySelector('.listening-signals tbody')?.textContent ?? '';

describe('Human Listening when the server holds no listening signal', () => {
  const reason = 'no listening signal has reached this server since it started';

  it('says not measured with the reason, never a zero, Low, 0% or No active sessions', async () => {
    serve({ metrics: { body: { measured: false, reason } } });
    const el = await section();
    expect(el.querySelector('.listening-note')?.textContent).toBe(`not measured: ${reason}`);
    expect(tiles(el)).toEqual(Array(8).fill('not measured'));
    expect(live(el)).toContain(`not measured: ${reason}`);
    expect(live(el)).not.toContain('No active sessions');
    expect(signalRows(el)).toContain(`not measured: ${reason}`);
  });
});

describe('Human Listening when a request fails', () => {
  it('a 500 on every route: unavailable with the status, and no number anywhere in the tiles', async () => {
    serve({ metrics: { status: 500 }, signals: { status: 500 }, live: { status: 500 } });
    const el = await section();
    expect(el.querySelector('.listening-note')?.textContent).toBe('unavailable (HTTP 500)');
    expect(tiles(el)).toEqual(Array(8).fill('unavailable'));
    expect(live(el)).toContain('unavailable (HTTP 500)');
    expect(live(el)).not.toContain('No active sessions');
    expect(signalRows(el)).toContain('unavailable (HTTP 500)');
  });

  it('nothing answers: unavailable (network error), and the page still renders', async () => {
    serve({ metrics: { reject: true }, signals: { reject: true }, live: { reject: true } });
    const el = await section();
    expect(el.querySelector('.listening-note')?.textContent).toBe('unavailable (network error)');
    expect(live(el)).toContain('unavailable (network error)');
    expect(el.querySelector('.listening-features')).not.toBeNull();
  });
});

describe('Human Listening with measured metrics', () => {
  it('shows each count and both averages, with no note', async () => {
    serve({ metrics: { body: MEASURED } });
    const el = await section();
    expect(el.querySelector('.listening-note')).toBeNull();
    expect(tiles(el)).toEqual(['3', '1', 'High', '50%', '2', '4', '0', '5']);
  });

  it('an average with no reading in the window says so instead of Low or 0%', async () => {
    serve({ metrics: { body: { ...MEASURED, avgCognitiveLoad: null, avgEngagement: null } } });
    const el = await section();
    const [, , load, engagement] = tiles(el);
    expect(load).toBe('not measured: no reading in the window');
    expect(engagement).toBe('not measured: no reading in the window');
  });

  it('an empty signal list from a measured server reads none recorded, and live sessions draw', async () => {
    const session = {
      sessionId: 'sess-1234abcd',
      cognitiveLoad: 'low',
      engagement: 'high',
      duration: 65000,
    };
    serve({ metrics: { body: MEASURED }, signals: { body: [] }, live: { body: [session] } });
    const el = await section();
    expect(signalRows(el)).toContain('none recorded');
    expect(live(el)).toContain('1:05');
  });
});

describe('Human Listening draws server text as text', () => {
  it('markup in a signal or a live session is shown, never run', async () => {
    const tag = '<img src=x onerror="alert(1)">';
    const signal = {
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      signalType: 'hedging',
      severity: 'low',
      details: tag,
      actionTaken: tag,
    };
    const session = {
      sessionId: 'sess-1',
      cognitiveLoad: 'low',
      engagement: 'high',
      duration: 1000,
      emotionalUndercurrent: tag,
    };
    serve({ metrics: { body: MEASURED }, signals: { body: [signal] }, live: { body: [session] } });
    const el = await section();
    expect(el.querySelector('img')).toBeNull();
    expect(signalRows(el)).toContain(tag);
    expect(live(el)).toContain(tag);
  });

  it('markup in a session id or a severity is shown, never run', async () => {
    const signal = {
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      signalType: 'hedging',
      severity: '<i>hi</i>',
      details: 'd',
    };
    const session = {
      sessionId: '<b>xy</b>',
      cognitiveLoad: 'low',
      engagement: 'high',
      duration: 1000,
    };
    serve({ metrics: { body: MEASURED }, signals: { body: [signal] }, live: { body: [session] } });
    const el = await section();
    expect(el.querySelector('i, b')).toBeNull();
    expect(signalRows(el)).toContain('<i>hi</i>');
    expect(live(el)).toContain('<b>xy</b');
  });

  it.each([
    ['metrics', { metrics: { body: { unavailable: 5 } } }],
    ['signals', { metrics: { body: MEASURED }, signals: { body: { unavailable: 5 } } }],
    ['live', { metrics: { body: MEASURED }, live: { body: { unavailable: null } } }],
  ])(
    'a %s body with a non-string unavailable field renders, drawing no number',
    async (_route, answers) => {
      serve(answers);
      const el = await section();
      expect(el.querySelector('.listening-features')).not.toBeNull();
    }
  );
});

describe('Human Listening with a body of the wrong shape', () => {
  it.each([
    ['null', null],
    ['an array', [1, 2]],
    ['a string', 'metrics'],
    ['measured with no window', { ...MEASURED, windowHours: undefined }],
    ['a missing count', { ...MEASURED, hedgingDetections: undefined }],
    ['a negative count', { ...MEASURED, totalSessions: -1 }],
    ['an average above 1', { ...MEASURED, avgEngagement: 1.5 }],
    ['not measured with no reason', { measured: false }],
    ['not measured with a blank reason', { measured: false, reason: ' ' }],
    ['a server body with a numeric unavailable field', { unavailable: 5 }],
  ])('%s: not measured, the server sent no metrics', (_label, body) => {
    expect(metricsFrom(body)).toEqual({ measured: false, reason: 'the server sent no metrics' });
  });

  it('a signal list that is not a list, or holds an entry it cannot draw, says so', async () => {
    serve({
      metrics: { body: MEASURED },
      signals: { body: { rows: [] } },
      live: { body: [{ sessionId: 7 }] },
    });
    const el = await section();
    expect(signalRows(el)).toContain('unavailable: the server sent signals it could not read');
    expect(live(el)).toContain('unavailable: the server sent live sessions it could not read');
  });
});
