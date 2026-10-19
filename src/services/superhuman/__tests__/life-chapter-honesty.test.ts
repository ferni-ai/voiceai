/**
 * "Your Current Chapter" names a chapter only when the data supports it.
 *
 * Before: one regex hit in one conversation opened a chapter (`/\bi lost my/`
 * matched "I lost my keys"), a chapter never ended, and a loss chapter read
 * "Something beautiful is taking shape". These cases run the real narrative
 * service and the real insights route with n = 0, 1, 2 and 3 conversations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type http from 'http';

const { onLifeChapterTransition } = vi.hoisted(() => ({
  onLifeChapterTransition: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../firestore-utils.js', () => ({
  getFirestoreDb: () => null,
  cleanForFirestore: <T>(v: T) => v,
}));
vi.mock('../../data-layer/integrations/index.js', () => ({ indexLifeChapter: vi.fn() }));
vi.mock('../../outreach/superhuman-outreach-bridge.js', () => ({ onLifeChapterTransition }));
vi.mock('../../../api/auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth: vi.fn(async () => ({ userId: 'chapter-user', isAdmin: false })),
}));

const narrative = await import('../life-narrative.js');
const signals = await import('../life-chapter-signals.js');
const { handleInsightsRoutes } = await import('../../../api/insights-routes.js');

const DAY = 24 * 60 * 60 * 1000;
let userSeq = 0;

async function getChapterFromRoute(userId: string) {
  const res = {
    statusCode: 0,
    body: '',
    setHeader: vi.fn(),
    writeHead: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    end: vi.fn((chunk?: string) => {
      res.body = chunk ?? '';
    }),
  };
  const req = {
    method: 'GET',
    headers: {},
    url: `/api/insights/${userId}`,
  } as http.IncomingMessage;
  await handleInsightsRoutes(req, res as unknown as http.ServerResponse, `/api/insights/${userId}`);
  return JSON.parse(res.body || '{}').chapter as { type: string; title: string } | undefined;
}

beforeEach(() => onLifeChapterTransition.mockClear());

describe('a loss chapter needs a person or a pet, never an object', () => {
  it.each([
    ['I lost my keys again', false],
    ['I lost my phone at the gym', false],
    ['ugh I lost my wallet', false],
    ['I lost my temper with him', false],
    ['I lost my mind a little', false],
    ["I lost my dog's leash", false],
    ['I lost my mom last spring', true],
    ['I just lost my dad', true],
    ['we had to put him down, I lost my dog', true],
  ])('"%s" opens a loss chapter: %s', (text, isLoss) => {
    expect(narrative.detectChapterMoment(text)?.type === 'loss').toBe(isLoss);
  });
});

describe('naming waits for separate conversations', () => {
  it.each([
    { n: 0, sessions: [] as string[], named: false },
    { n: 1, sessions: ['s1', 's1', 's1'], named: false }, // three lines, one conversation
    { n: 2, sessions: ['s1', 's2'], named: true },
    { n: 3, sessions: ['s1', 's2', 's3'], named: true },
  ])('$n conversation(s): named = $named', async ({ sessions, named }) => {
    const userId = `chapter-user-${++userSeq}`;
    for (const conversationId of sessions) {
      await narrative.createOrUpdateChapter(userId, {
        type: 'loss',
        quote: 'I lost my mom last spring',
        conversationId,
      });
    }
    const chapters = await narrative.loadUserChapters(userId);
    expect(chapters.length).toBe(sessions.length ? 1 : 0);
    const context = await narrative.buildNarrativeContext(userId);
    expect(Boolean(context.currentChapter)).toBe(named);
    expect(Boolean(await narrative.buildNarrativeContextString(userId))).toBe(named);
    // Outreach goes out once, when the chapter first becomes nameable
    expect(onLifeChapterTransition).toHaveBeenCalledTimes(named ? 1 : 0);
  });

  it('the insights route shows the chapter only once it is nameable, with its real type', async () => {
    const userId = 'chapter-user';
    await narrative.createOrUpdateChapter(userId, {
      type: 'loss',
      quote: 'I lost my dad',
      conversationId: 'a',
    });
    expect(await getChapterFromRoute(userId)).toBeUndefined();
    await narrative.createOrUpdateChapter(userId, {
      type: 'loss',
      quote: 'I miss him',
      conversationId: 'b',
    });
    expect((await getChapterFromRoute(userId))?.type).toBe('loss');
  });
});

describe('chapters fade after a quiet stretch', () => {
  const now = Date.now();
  const named = { startDate: now - 90 * DAY, conversationIds: ['a', 'b'] };
  it.each([
    { quietDays: 0, current: true },
    { quietDays: signals.CHAPTER_FADE_DAYS - 1, current: true },
    { quietDays: signals.CHAPTER_FADE_DAYS + 1, current: false },
  ])('quiet for $quietDays days: current = $current', ({ quietDays, current }) => {
    const chapter = { ...named, lastUpdated: now - quietDays * DAY };
    expect(signals.isChapterCurrent(chapter, now)).toBe(current);
    expect(Boolean(signals.getCurrentChapter([chapter], now))).toBe(current);
  });

  it('a closed chapter is never current', () => {
    expect(signals.isChapterCurrent({ ...named, lastUpdated: now, endDate: now }, now)).toBe(false);
  });

  it.each([
    { stored: 0, named: false },
    { stored: 1, named: false },
    { stored: 3, named: true },
  ])(
    'a chapter stored before conversationIds with conversationCount $stored: named = $named',
    ({ stored, named }) => {
      const legacy = { startDate: now, lastUpdated: now, conversationCount: stored };
      expect(Boolean(signals.getCurrentChapter([legacy], now))).toBe(named);
    }
  );
});

describe('chapters stored before conversations were tracked', () => {
  it('keep their count (the list is seeded from it, not reset) and never trigger outreach', async () => {
    const userId = `legacy-${Math.random()}`;
    const base = {
      id: `chapter_legacy_${userId}`,
      userId,
      title: 'Saying Goodbye',
      summary: 'I lost my mom',
      type: 'loss' as const,
      startDate: Date.now() - DAY,
      keyQuotes: ['I lost my mom'],
      keyPeople: [],
      keyEmotions: [],
      keyThemes: [],
      insightsGained: [],
      strengthsRevealed: [],
      patternsIdentified: [],
      createdAt: Date.now() - DAY,
      lastUpdated: Date.now() - DAY,
    };
    // Stored with a count of 1 and no conversationIds: the next mention makes it 2
    await narrative.saveChapter({ ...base, conversationCount: 1 });
    const after = await narrative.createOrUpdateChapter(userId, {
      type: 'loss',
      quote: 'I miss her',
      conversationId: 'new-session',
    });
    expect(after.conversationIds).toEqual(['legacy:0', 'new-session']);
    expect(after.conversationCount).toBe(2);
    expect(signals.isChapterNameable(after)).toBe(true);
    expect(onLifeChapterTransition).not.toHaveBeenCalled();
  });
});
