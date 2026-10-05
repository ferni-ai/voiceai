/**
 * The practice view must render its copy for the caller's Accept-Language,
 * not hard-coded English. tFor is mocked to echo `${locale}|${key}`, so every
 * assertion proves the handler resolved the locale and asked for that key.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { tForMock } = vi.hoisted(() => ({
  tForMock: vi.fn(
    (locale: string, key: string, _params?: Record<string, unknown>) => `${locale}|${key}`
  ),
}));

vi.mock('../../../i18n/index.js', () => ({
  tFor: tForMock,
  localeForRequest: vi.fn(async (header?: string | null) =>
    header?.startsWith('fr') ? 'fr' : 'en-US'
  ),
}));

vi.mock('../../../services/calendar/index.js', () => ({
  getEvents: vi.fn(async () => [
    {
      id: 'e1',
      title: 'Team meeting',
      startTime: new Date(2026, 9, 7, 9),
      endTime: new Date(2026, 9, 7, 10),
    },
  ]),
}));
vi.mock('../../../services/superhuman/semantic-intelligence/index.js', () => ({
  buildSemanticIntelligenceContext: vi.fn(async () => ({ activeCorrelations: [] })),
}));
vi.mock('../../../services/superhuman/index.js', () => ({
  buildSuperhumanContext: vi.fn(async () => ({})),
}));
vi.mock('../../../services/superhuman/predictive-coaching.js', () => ({
  generatePredictions: vi.fn(async () => []),
}));

const { handleGetPracticeView, handleGetPatterns } = await import('../practice-view.js');
const { generateHabitInsight, generateTaskInsight, getTaskInsightPersona } =
  await import('../practice-view-copy.js');

function request(acceptLanguage?: string): IncomingMessage {
  const headers: Record<string, string> = { 'x-firebase-uid': 'user-1' };
  if (acceptLanguage) headers['accept-language'] = acceptLanguage;
  return { headers, method: 'GET' } as unknown as IncomingMessage;
}

function response() {
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
    json: () => JSON.parse(raw) as Record<string, any>,
  };
  return res as unknown as ServerResponse & { json: () => Record<string, any> };
}

const url = new URL('http://localhost/api/practice-view');

beforeEach(() => {
  vi.clearAllMocks();
  // Wednesday 10:00 local: today is Wednesday, morning
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 10));
});
afterEach(() => vi.useRealTimers());

async function getView(acceptLanguage?: string) {
  const res = response();
  await handleGetPracticeView(request(acceptLanguage), res, url);
  return res.json();
}

describe('GET /api/practice-view localization', () => {
  it('renders the per-day insights for the Accept-Language locale', async () => {
    const body = await getView('fr');
    const byDate = Object.fromEntries(body.week.map((d: any) => [d.dayNum, d]));
    expect(byDate[7].insight).toBe('fr|practiceView.dayInsight.morningIntention'); // today, 10:00
    expect(byDate[5].insight).toBe('fr|practiceView.dayInsight.freshStart'); // Monday
    expect(byDate[6].insight).toBe('fr|practiceView.dayInsight.buildMomentum'); // Tuesday
    expect(byDate[8].insight).toBe('fr|practiceView.dayInsight.almostThere'); // Thursday
    expect(byDate[9].insight).toBe('fr|practiceView.dayInsight.windDown'); // Friday
    expect(byDate[4].insight).toBe('fr|practiceView.dayInsight.recharge'); // Sunday
    expect(byDate[7].insightPersona).toBe('Ferni');
  });

  it('formats weekday names with Intl for the locale instead of English tables', async () => {
    const fr = await getView('fr');
    const en = await getView();
    const wed = (b: any) => b.week.find((d: any) => d.dayNum === 7);
    expect(wed(fr).dayName).toBe('mercredi');
    expect(wed(en).dayName).toBe('Wednesday');
    expect(wed(en).shortName).toBe('Wed');
    expect(wed(fr).shortName).not.toBe('Wed');
  });

  it('localizes the default intentions and their persona attribution', async () => {
    const body = await getView('fr');
    expect(body.intentions.map((i: any) => i.text)).toEqual([
      'fr|practiceView.defaultIntention.start',
      'fr|practiceView.defaultIntention.oneThing',
      'fr|practiceView.defaultIntention.gratitude',
    ]);
    expect(body.intentions[2].insight).toBe('fr|practiceView.defaultIntention.gratitudeInsight');
    expect(body.intentions[2].insightPersona).toBe('fr|practiceView.attribution.found');
    expect(tForMock).toHaveBeenCalledWith('fr', 'practiceView.attribution.found', {
      persona: 'Peter',
    });
  });

  it('localizes the whisper and the event note', async () => {
    const body = await getView('fr');
    expect(body.mayaNotices.message).toMatch(/^fr\|practiceView\.pattern\./);
    expect(body.todayEvents[0].emotionalContext).toEqual({
      persona: 'fr|practiceView.attribution.suggests',
      insight: 'fr|practiceView.eventContext.meeting',
    });
    expect(tForMock).toHaveBeenCalledWith('fr', 'practiceView.attribution.suggests', {
      persona: 'Jordan',
    });
  });

  it('localizes habit and task insights with interpolated params', () => {
    expect(generateHabitInsight({ streak: 8 }, 'fr' as never)).toBe(
      'fr|practiceView.habit.streakWeek'
    );
    expect(tForMock).toHaveBeenCalledWith('fr', 'practiceView.habit.streakWeek', { streak: 8 });
    expect(generateHabitInsight({ streak: 4 }, 'fr' as never)).toBe(
      'fr|practiceView.habit.streakDays'
    );
    expect(generateHabitInsight({ completedDates: ['d'] }, 'fr' as never)).toBe(
      'fr|practiceView.habit.momentum'
    );
    expect(generateTaskInsight({ priority: 'high' }, 'fr' as never)).toBe(
      'fr|practiceView.task.highPriority'
    );
    const inTwoDays = new Date(2026, 9, 9, 10).toISOString();
    expect(generateTaskInsight({ dueDate: inTwoDays }, 'fr' as never)).toBe(
      'fr|practiceView.task.dueInDays'
    );
    expect(tForMock).toHaveBeenCalledWith('fr', 'practiceView.task.dueInDays', { days: 2 });
    expect(getTaskInsightPersona({ category: 'family' }, 'fr' as never)).toBe(
      'fr|practiceView.attribution.notes'
    );
    expect(getTaskInsightPersona({}, 'fr' as never)).toBe('Ferni');
  });

  it('keeps English locale and response shape for requests without Accept-Language', async () => {
    const body = await getView();
    expect(body.week[3].insight).toBe('en-US|practiceView.dayInsight.morningIntention');
    expect(Object.keys(body).sort()).toEqual(
      [
        'success',
        'orchestratingPersona',
        'week',
        'todayEvents',
        'intentions',
        'mayaNotices',
        'crossPersonaInsights',
        'predictions',
        'pendingOutreach',
        'stats',
        'lastUpdated',
      ].sort()
    );
  });
});

describe('GET /api/practice-view/patterns localization', () => {
  it('returns the pattern whisper in the requested locale', async () => {
    const res = response();
    await handleGetPatterns(
      request('fr'),
      res,
      new URL('http://localhost/api/practice-view/patterns')
    );
    expect(res.json().patterns[0].message).toMatch(/^fr\|practiceView\.pattern\./);
  });
});

describe('practiceView key coverage', () => {
  it('has an English entry in the key fragment for every key the route code uses', () => {
    const fragment = JSON.parse(
      readFileSync(new URL('../../../i18n/locales/en-US.json', import.meta.url), 'utf8')
    ) as { practiceView: Record<string, unknown> };
    const has = (key: string) =>
      typeof key
        .split('.')
        .slice(1)
        .reduce<any>((o, k) => o?.[k], fragment.practiceView) === 'string';

    const files = ['../practice-view.ts', '../practice-view-copy.ts'];
    const keys = files.flatMap((f) =>
      [
        ...readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').matchAll(
          /'(practiceView\.[\w.]+)'/g
        ),
      ].map((m) => m[1] as string)
    );
    expect(keys.length).toBeGreaterThan(30);
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });
});
