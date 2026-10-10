/**
 * Your Story, end to end: the REAL /api/your-story/full handler, the REAL web
 * transform, and the REAL dashboard with every visualization component.
 *
 * Only auth and the persisted-data stores the server reads are mocked, so
 * each section is exactly what the server builds from that data.
 *
 * Before: six sections didn't match what their components read, and most
 * were canned on the server (hardcoded chapters, a hero's-journey "recovery
 * path", 5 loops "closed this week", growth scores of 75/68/62...). On an
 * empty story mood calendar, life timeline, emotional arcs, relationship
 * network, open loops and predictions all threw while rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('../../../../src/api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u1', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

/** What the stores hold for this user; each test fills it. */
const store = vi.hoisted(() => ({
  conversations: 5,
  energy: [] as Array<{ timestamp: number; energyScore: number }>,
  moods: [] as Array<Record<string, unknown>>,
  chapters: [] as Array<Record<string, unknown>>,
  arcs: [] as Array<Record<string, unknown>>,
  people: [] as Array<Record<string, unknown>>,
  opportunities: [] as Array<Record<string, unknown>>,
  loops: [] as Array<Record<string, unknown>>,
}));

// The relationship arc the voice agent saves at the end of every conversation
// (bogle_users/{uid}/relationship_arc/data). The in-memory rhythm stats are NOT
// mocked: in the API process they are always empty, which is the bug.
vi.mock('../../../../src/intelligence/context-builders/relationship/arc/storage.js', () => ({
  getCurrentStage: async () => 'friend',
  loadRelationshipArcData: async () =>
    store.conversations > 0
      ? {
          totalSessions: store.conversations,
          firstSessionDate: Date.now() - 20 * 24 * 60 * 60 * 1000,
          lastSessionDate: Date.now() - 60 * 60 * 1000,
        }
      : null,
}));
vi.mock('../../../../src/services/superhuman/capacity-guardian.js', () => ({
  loadEnergyHistory: async () => store.energy,
  assessBurnoutRisk: async () => ({ risk: 'low', recommendations: [] }),
}));
vi.mock('../../../../src/services/superhuman/mood-calendar.js', () => ({
  loadMoodEntries: async () => store.moods,
  detectMoodPatterns: () => [],
}));
vi.mock('../../../../src/services/superhuman/life-narrative.js', () => ({
  loadUserChapters: async () => store.chapters,
}));
vi.mock(
  '../../../../src/services/superhuman/semantic-intelligence/emotional-trajectories.js',
  () => ({
    getActiveArcs: async () => store.arcs,
  })
);
vi.mock('../../../../src/services/superhuman/relationship-network.js', () => ({
  loadNetwork: async () => store.people,
  findConnectionOpportunities: async () => store.opportunities,
}));
vi.mock('../../../../src/services/superhuman/semantic-intelligence/open-loops.js', () => ({
  getAllOpenLoops: async () => store.loops,
  getLoopsReadyForFollowUp: async () => store.loops,
}));
// Stores the old server read; mocked so the old code can be run against this test.
vi.mock('../../../../src/services/growth-visibility-engine.js', () => ({
  getGrowthVisibilityEngine: () => ({
    detectGrowth() {},
    getStats: () => ({}),
    getAllInsights: () => [],
  }),
}));
vi.mock('../../../../src/services/personal-journey/chapter-detector.js', () => ({
  getChapterMoments: () => [],
}));
vi.mock('../../../../src/services/predictive-insights/index.js', () => ({
  runPredictiveAnalysis: async () => [],
}));

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: (...a: unknown[]) => apiGet(...a) }));

const { handleYourStoryRoutes } = await import('../../../../src/api/your-story-routes.js');
const { fetchYourStory } = await import('../../src/services/your-story.service.js');
const { getYourStoryUI } = await import('../../src/ui/your-story-dashboard.ui.js');
const viz = await import('../../src/ui/visualizations/index.js');
type YourStoryData = import('../../src/ui/visualizations/index.js').YourStoryData;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const iso = (t: number) => new Date(t).toISOString();

const SIX = [
  'viz-mood-calendar',
  'viz-life-timeline',
  'viz-emotional-arcs',
  'viz-relationship-network',
  'viz-open-loops',
  'viz-predictions',
];

/** GET /api/your-story/full from the real handler, then the real web pipeline into the dashboard. */
async function renderStory(): Promise<{
  story: Record<string, unknown>;
  web: YourStoryData;
  renderErrors: string[];
}> {
  let payload = '';
  const path = '/api/your-story/full';
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn((chunk?: string) => {
      payload = chunk ?? '';
    }),
  };
  await handleYourStoryRoutes(
    { method: 'GET', url: path, headers: {} } as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    path,
    new URL(path, 'http://x')
  );
  const body = JSON.parse(payload) as { data: Record<string, unknown> };
  apiGet.mockResolvedValue({ ok: true, status: 200, data: body });

  const errors = vi.spyOn(console, 'error');
  const result = await fetchYourStory();
  if (result.status !== 'ok') throw new Error(`story not ok: ${result.status}`);
  getYourStoryUI().show(result.data);
  const renderErrors = errors.mock.calls
    .map((c) => c.map(String).join(' '))
    .filter((m) => /Error rendering/.test(m));
  return { story: body.data, web: result.data, renderErrors };
}

const frame = (id: string) => document.getElementById(id);

describe('Your Story header, real persisted conversation count', () => {
  beforeEach(() => {
    localStorage.setItem('ferni_user_id', 'u1');
    apiGet.mockReset();
    Object.assign(store, {
      conversations: 7,
      energy: [],
      moods: [],
      chapters: [],
      arcs: [],
      people: [],
      opportunities: [],
      loops: [],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('a user with 7 saved conversations gets a 7-conversation header and a non-empty story', async () => {
    const { story } = await renderStory();

    expect(story.header).toMatchObject({ totalConversations: 7, daysTogether: 21 });
    // No per-day record is persisted, so no streak is claimed.
    expect(story.header).toMatchObject({ currentStreak: null, longestStreak: null });
    const stats = document.querySelector('.your-story__stats')!.textContent!;
    expect(stats).toContain('7');
    expect(stats).toContain('21');
    expect(stats).not.toMatch(/streak/i);
  });

  it('a user with no saved conversations has an empty story, not a fake count', async () => {
    store.conversations = 0;
    let payload = '';
    const path = '/api/your-story/full';
    await handleYourStoryRoutes(
      { method: 'GET', url: path, headers: {} } as unknown as IncomingMessage,
      {
        headersSent: false,
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: (c?: string) => (payload = c ?? ''),
      } as unknown as ServerResponse,
      path,
      new URL(path, 'http://x')
    );
    apiGet.mockResolvedValue({ ok: true, status: 200, data: JSON.parse(payload) });
    expect((JSON.parse(payload) as { data: { header: unknown } }).data.header).toMatchObject({
      totalConversations: 0,
    });
    expect(await fetchYourStory()).toEqual({ status: 'empty' });
  });
});

describe('Your Story dashboard, real server output', () => {
  beforeEach(() => {
    localStorage.setItem('ferni_user_id', 'u1');
    apiGet.mockReset();
    Object.assign(store, {
      conversations: 5,
      energy: [],
      moods: [],
      chapters: [],
      arcs: [],
      people: [],
      opportunities: [],
      loops: [],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('empty story: renders without a single render error and with no invented section', async () => {
    const { story, renderErrors } = await renderStory();

    expect(renderErrors).toEqual([]);
    // The server sends nothing it doesn't have...
    for (const key of ['moodCalendar', 'emotionalArc', 'yourWorld', 'openLoops', 'prediction']) {
      expect(story[key], key).toBeNull();
    }
    // Growth and the "recovery path" had no real source; they're gone from the API.
    expect(story).not.toHaveProperty('growth');
    expect(story).not.toHaveProperty('recoveryPath');
    expect(story.lifeChapters).toEqual([]);
    // ...and the dashboard shows no frame for any of it.
    expect(document.querySelector('.your-story__section')).not.toBeNull();
    for (const id of [...SIX, 'viz-growth-radar']) expect(frame(id)).toBeNull();
    expect(document.querySelector('.your-story')!.textContent).not.toMatch(
      /mostly calm|Focus area: growth|Your Journey|undefined|NaN/
    );
  });

  it('realistic story: each section renders the real data, with no render errors', async () => {
    store.energy = [50, 53, 54, 57, 58, 61, 62, 65].map((s, i) => ({
      timestamp: NOW - (7 - i) * DAY,
      energyScore: s,
    }));
    store.moods = [
      ['anxious', 7],
      ['anxious', 6],
      ['frustrated', 5],
      ['calm', 3],
      ['joyful', 2],
      ['content', 1],
      ['calm', 0],
    ].map(([mood, ago]) => {
      const t = NOW - (ago as number) * DAY;
      return {
        userId: 'u1',
        mood,
        intensity: 0.6,
        dayOfWeek: 0,
        hourOfDay: 9,
        month: 9,
        dayOfMonth: 1,
        timestamp: t,
      };
    });
    store.chapters = [
      {
        id: 'c2',
        userId: 'u1',
        title: 'Leaving the Agency',
        summary: 'Deciding to go out on your own',
        type: 'transition',
        startDate: NOW - 20 * DAY,
        keyQuotes: [],
        keyPeople: [],
        keyEmotions: [],
        keyThemes: [],
        insightsGained: [],
        strengthsRevealed: [],
        patternsIdentified: [],
        createdAt: NOW - 20 * DAY,
        lastUpdated: NOW - DAY,
        conversationCount: 4,
      },
      {
        id: 'c1',
        userId: 'u1',
        title: 'The Marathon Year',
        summary: 'Training through the winter',
        type: 'triumph',
        startDate: NOW - 200 * DAY,
        endDate: NOW - 60 * DAY,
        keyQuotes: [],
        keyPeople: [],
        keyEmotions: [],
        keyThemes: [],
        insightsGained: [],
        strengthsRevealed: [],
        patternsIdentified: [],
        createdAt: NOW - 200 * DAY,
        lastUpdated: NOW - 60 * DAY,
        conversationCount: 6,
      },
    ];
    store.arcs = [
      {
        id: 'a1',
        userId: 'u1',
        theme: 'work anxiety',
        emotion: 'anxiety',
        phase: 'resolving',
        trend: 'falling',
        narrative: 'Worry about the launch peaked last week and has been easing.',
        waypoints: [
          {
            timestamp: NOW - 9 * DAY,
            emotion: 'worry',
            intensity: 0.5,
            valence: -0.4,
            arousal: 0.6,
          },
          {
            timestamp: NOW - 5 * DAY,
            emotion: 'dread',
            intensity: 0.9,
            valence: -0.7,
            arousal: 0.8,
          },
          { timestamp: NOW - DAY, emotion: 'relief', intensity: 0.4, valence: 0.2, arousal: 0.3 },
        ],
        startedAt: NOW - 9 * DAY,
        lastUpdated: NOW - DAY,
      },
    ];
    store.people = [
      {
        id: 'p1',
        userId: 'u1',
        name: 'Maria',
        aliases: [],
        type: 'partner',
        sentiment: 'positive',
        importance: 0.9,
        firstMentioned: NOW - 90 * DAY,
        lastMentioned: NOW - 2 * DAY,
        mentionCount: 30,
        recentMentions: [],
        themes: [],
        positiveAspects: [],
        painPoints: [],
        contextNotes: [],
      },
      {
        id: 'p2',
        userId: 'u1',
        name: 'Dad',
        aliases: [],
        type: 'family',
        sentiment: 'neutral',
        importance: 0.6,
        firstMentioned: NOW - 90 * DAY,
        lastMentioned: NOW - 45 * DAY,
        mentionCount: 8,
        recentMentions: [],
        themes: [],
        positiveAspects: [],
        painPoints: [],
        contextNotes: [],
        mentionGapDays: 45,
      },
    ];
    store.opportunities = [
      {
        personId: 'p2',
        personName: 'Dad',
        type: 'reconnect',
        reason: '45 days',
        suggestedAction: 'Call him',
        urgency: 'normal',
      },
    ];
    store.loops = [
      {
        id: 'l1',
        userId: 'u1',
        type: 'intention',
        content: 'sign up for the pottery class',
        context: '',
        created: new Date(NOW - 10 * DAY),
        followUpAfter: new Date(NOW - 3 * DAY),
        followUpBefore: new Date(NOW + 9 * DAY),
        status: 'open',
        priority: 8,
        followUpCount: 0,
      },
      {
        id: 'l2',
        userId: 'u1',
        type: 'commitment',
        content: 'send the invoice to Sam',
        context: '',
        created: new Date(NOW - 2 * DAY),
        followUpAfter: new Date(NOW - DAY),
        followUpBefore: new Date(NOW + 5 * DAY),
        status: 'open',
        priority: 5,
        followUpCount: 0,
      },
    ];

    const { story, web, renderErrors } = await renderStory();

    expect(renderErrors).toEqual([]);
    const text = (id: string) => frame(id)?.textContent ?? '';
    for (const id of SIX) expect(frame(id), id).not.toBeNull();
    for (const id of SIX) expect(text(id), id).not.toMatch(/undefined|NaN|\[object Object\]/);

    // Mood calendar: the real moods, counted from the entries.
    expect(story.moodCalendar).toMatchObject({ summary: { dominantMood: 'anxious', calmDays: 3 } });
    expect(text('viz-mood-calendar')).toMatch(/anxious/i);
    // Life timeline: the persisted chapters; the ongoing one is current.
    expect(text('viz-life-timeline')).toContain('Leaving the Agency');
    expect(text('viz-life-timeline')).not.toMatch(
      /through this chapter|Intentional Living|Finding My Footing/
    );
    // Emotional arc: the user's own arc, not a hero's journey.
    expect(text('viz-emotional-arcs')).toMatch(/work anxiety/i);
    expect(text('viz-emotional-arcs')).not.toMatch(/The Rise|The Call|Hero Journey|Recovery Path/);
    // Relationship network: real people; Dad not mentioned for 45 days needs attention.
    expect(text('viz-relationship-network')).toContain('Maria');
    expect(story.yourWorld).toMatchObject({
      totalConnections: 2,
      activeConnections: 1,
      needsAttention: ['Dad'],
    });
    // Open loops: all open loops, no invented "closed this week".
    expect(text('viz-open-loops')).toContain('pottery class');
    expect(text('viz-open-loops')).not.toMatch(/closed (this week|recently)/);
    // Predictions: the energy forecast.
    expect(text('viz-predictions')).toMatch(/From 8 energy readings/);
    // Growth radar has no real source: no frame.
    expect(frame('viz-growth-radar')).toBeNull();

    // Every component renders this real data at every device size without throwing.
    const builders: Array<[string, (c: HTMLElement, d: never, x: never) => unknown, unknown]> = [
      ['mood-calendar', viz.buildMoodCalendar, web.moodCalendar],
      ['life-timeline', viz.buildLifeTimeline, web.lifeTimeline],
      ['emotional-arcs', viz.buildEmotionalArcs, web.emotionalArcs],
      ['relationship-network', viz.buildRelationshipNetwork, web.relationshipNetwork],
      ['open-loops', viz.buildOpenLoops, web.openLoops],
      ['predictions', viz.buildPredictions, web.predictions],
    ];
    for (const type of ['watch', 'mobile', 'tablet', 'desktop'] as const) {
      const context = {
        type,
        platform: 'web',
        width: 400,
        height: 800,
        prefersReducedMotion: true,
      };
      for (const [name, build, data] of builders) {
        const el = document.createElement('div');
        expect(() => build(el, data as never, context as never), `${name}@${type}`).not.toThrow();
        expect(el.textContent, `${name}@${type}`).not.toMatch(/undefined|NaN|\[object Object\]/);
      }
    }
  });
});
