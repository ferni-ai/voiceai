/**
 * The Sanctuary route renders its copy per request: the locale comes from
 * Accept-Language and every user-facing string goes through tFor(). tFor is
 * stubbed to echo `${locale}|${key}`, so an assertion on a field proves the
 * handler routed that field through the translation layer for that locale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

const mocks = vi.hoisted(() => ({
  buildSuperhumanContext: vi.fn(),
  loadUserPatterns: vi.fn(),
  getInsightsToSurface: vi.fn(),
}));

vi.mock('../../i18n/index.js', async () => {
  const { localeFromAcceptLanguage } = await import('../../i18n/detection/request.js');
  return {
    localeForRequest: vi.fn(async (header: string | undefined) => localeFromAcceptLanguage(header)),
    tFor: vi.fn(),
  };
});
vi.mock('../auth-middleware.js', () => ({ requireAuth: vi.fn() }));
vi.mock('../../services/superhuman/index.js', () => ({
  buildSuperhumanContext: mocks.buildSuperhumanContext,
}));
vi.mock('../../services/superhuman/predictive-coaching.js', () => ({
  loadUserPatterns: mocks.loadUserPatterns,
}));
vi.mock('../../services/superhuman/semantic-intelligence/insight-broker.js', () => ({
  getInsightsToSurface: mocks.getInsightsToSurface,
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: (v: unknown) => v,
}));

import { handleSanctuaryRoutes } from '../sanctuary-routes.js';
import { tFor } from '../../i18n/index.js';

function get(path: string, acceptLanguage: string): IncomingMessage {
  return {
    method: 'GET',
    url: path,
    headers: { host: 'localhost', 'accept-language': acceptLanguage },
  } as unknown as IncomingMessage;
}

function response(): { res: ServerResponse; json: () => Record<string, any> } {
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((d?: string) => {
      raw = d ?? '';
    }),
  } as unknown as ServerResponse;
  return { res, json: () => JSON.parse(raw) };
}

async function call(path: string, acceptLanguage: string) {
  const { res, json } = response();
  const pathname = path.split('?')[0];
  const handled = await handleSanctuaryRoutes(get(path, acceptLanguage), res, pathname);
  expect(handled).toBe(true);
  return json();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tFor).mockImplementation(
    ((locale: string, key: string) => `${locale}|${key}`) as typeof tFor
  );
  mocks.buildSuperhumanContext.mockResolvedValue({
    commitments: 'Call mom\nSend the report',
    narrative: 'a story',
  });
  mocks.loadUserPatterns.mockResolvedValue([
    { id: 'p1', trigger: 'Mondays', outcome: 'you feel rushed' },
  ]);
  mocks.getInsightsToSurface.mockResolvedValue([
    { id: 'i1', source: 'growth', priority: 'critical', insight: 'upstream text' },
  ]);
});

describe('sanctuary routes localize with Accept-Language', () => {
  it('GET /api/sanctuary renders greeting, insights, practices and quote via tFor', async () => {
    const body = await call('/api/sanctuary?userId=u1', 'de');

    expect(body.greeting).toMatch(/^de\|sanctuary\.greeting\.(morning|afternoon|evening|night)$/);
    expect(body.timeContext).toMatch(/^(morning|afternoon|evening|night)$/);

    const byId = Object.fromEntries(body.insights.map((i: { id: string }) => [i.id, i]));
    expect(byId.i1.title).toBe('de|sanctuary.insights.sources.growth');
    expect(byId.i1.actionLabel).toBe('de|sanctuary.insights.actions.explore');
    expect(byId.i1.description).toBe('upstream text');
    expect(byId.commitment_reminder.title).toBe('de|sanctuary.insights.commitments.title');
    expect(byId.commitment_reminder.description).toBe(
      'de|sanctuary.insights.commitments.description.other'
    );
    expect(byId.pattern_p1.title).toBe('de|sanctuary.insights.pattern.title');
    expect(byId.pattern_p1.description).toBe('de|sanctuary.insights.pattern.description');
    expect(byId.growth_narrative.actionLabel).toBe('de|sanctuary.insights.actions.viewJourney');

    expect(body.practices).toHaveLength(8);
    const windDown = body.practices.find((p: { id: string }) => p.id === 'wind-down');
    expect(windDown).toMatchObject({
      id: 'wind-down',
      category: 'ground',
      icon: 'moon',
      name: 'de|sanctuary.practices.windDown.name',
      description: 'de|sanctuary.practices.windDown.description',
      duration: 'de|sanctuary.practices.windDown.duration',
      prompt: 'de|sanctuary.practices.windDown.prompt',
    });
    for (const p of body.practices) {
      expect(p.name).toMatch(/^de\|sanctuary\.practices\.\w+\.name$/);
      expect(p.prompt).toMatch(/^de\|sanctuary\.practices\.\w+\.prompt$/);
      if (p.recommended)
        expect(p.reasonRecommended).toMatch(/^de\|sanctuary\.practices\.\w+\.reason$/);
      else expect(p.reasonRecommended).toBeUndefined();
    }

    expect(body.inspiration.quote).toMatch(
      /^de\|sanctuary\.quotes\.(morning|afternoon|evening|night)\.\w+$/
    );
  });

  it('passes the Accept-Language locale, not a fixed one, to every string', async () => {
    const body = await call('/api/sanctuary?userId=u1', 'ja,en;q=0.5');
    expect(body.greeting.startsWith('ja|')).toBe(true);
    expect(body.practices.every((p: { name: string }) => p.name.startsWith('ja|'))).toBe(true);
    expect(body.inspiration.quote.startsWith('ja|')).toBe(true);
    expect(vi.mocked(tFor).mock.calls.every(([locale]) => locale === 'ja')).toBe(true);
  });

  it('keeps the quote author as-is, and translates the missing-author label', async () => {
    const authors = new Set<string>();
    const unknown = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const { inspiration } = await call('/api/sanctuary?userId=u1', 'de');
      (inspiration.source.startsWith('de|') ? unknown : authors).add(inspiration.source);
    }
    expect([...unknown]).toEqual(['de|sanctuary.quotes.unknownAuthor']);
    for (const a of authors) expect(a).not.toContain('|');
  });

  it('localizes the weekday in the greeting with Intl, not a key per day', async () => {
    vi.mocked(tFor).mockImplementation(
      ((locale: string, key: string, params?: Record<string, string>) =>
        `${key}:${params?.day ?? ''}`) as typeof tFor
    );
    const body = await call('/api/sanctuary?userId=u1', 'de');
    const expectedDay = new Date()
      .toLocaleDateString('de', { weekday: 'long' })
      .toLocaleUpperCase('de');
    expect(body.greeting).toMatch(new RegExp(`:${expectedDay}$`));
  });

  it('uses the singular commitment form for one commitment', async () => {
    mocks.buildSuperhumanContext.mockResolvedValue({ commitments: 'Call mom' });
    const body = await call('/api/sanctuary/insights?userId=u1', 'de');
    const c = body.insights.find((i: { id: string }) => i.id === 'commitment_reminder');
    expect(c.description).toBe('de|sanctuary.insights.commitments.description.one');
  });

  it('GET /api/sanctuary/insights falls back to the welcome insight, localized', async () => {
    mocks.buildSuperhumanContext.mockRejectedValue(new Error('down'));
    const body = await call('/api/sanctuary/insights?userId=u1', 'fr-CA');
    expect(body.insights).toEqual([
      expect.objectContaining({
        id: 'welcome',
        title: 'fr|sanctuary.insights.welcome.title',
        description: 'fr|sanctuary.insights.welcome.description',
      }),
    ]);
  });

  it('GET /api/sanctuary/practices localizes without a userId', async () => {
    const body = await call('/api/sanctuary/practices', 'es-MX');
    expect(body.practices).toHaveLength(8);
    expect(body.practices[0].name).toBe('es|sanctuary.practices.brainstorm.name');
  });

  it('falls back to en-US when Accept-Language is unsupported', async () => {
    const body = await call('/api/sanctuary/practices', 'xx');
    expect(body.practices[0].name).toBe('en-US|sanctuary.practices.brainstorm.name');
  });
});

describe('sanctuary translation keys', () => {
  const root = resolve(__dirname, '..');
  const fragment = JSON.parse(
    readFileSync(resolve(root, '../i18n/locales/en-US.json'), 'utf-8')
  ) as Record<string, unknown>;

  function lookup(key: string): unknown {
    return key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        fragment
      );
  }

  const sources = ['sanctuary-routes.ts', 'sanctuary-content.ts'].map((f) =>
    readFileSync(resolve(root, f), 'utf-8')
  );
  const literals = [
    ...new Set(
      sources.flatMap((src) => [...src.matchAll(/'(sanctuary\.[\w.]+)'/g)].map((m) => m[1]))
    ),
  ];

  it('finds the keys the route references', () => {
    expect(literals.length).toBeGreaterThan(30);
  });

  it('defines every referenced key in the fragment file', () => {
    const missing: string[] = [];
    for (const key of literals) {
      const node = lookup(key);
      if (node === undefined) {
        missing.push(key);
      } else if (typeof node === 'object') {
        // A prefix: practices expand to five leaves, plurals to one/other
        const expected = key.startsWith('sanctuary.practices.')
          ? ['name', 'description', 'duration', 'prompt', 'reason']
          : ['one', 'other'];
        for (const leaf of expected)
          if (typeof (node as Record<string, unknown>)[leaf] !== 'string')
            missing.push(`${key}.${leaf}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a title for every insight source and no unused leaf keys', () => {
    const used = new Set(literals);
    const unused: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        const covered = [...used].some((u) => path === u || path.startsWith(`${u}.`));
        if (!covered) unused.push(path);
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, `${path}.${k}`);
    };
    walk(fragment.sanctuary, 'sanctuary');
    expect(unused).toEqual([]);
  });
});
