/**
 * The router's other stores keep no caller words (Seth, 2026-10-24, as #2775 did for
 * semantic_router_events), on the Firestore emulator. A routed turn the caller corrects
 * runs through the real writers: the learning loop (feedback, the per-person correction,
 * and the three paths that used to learn the phrase), the correction store (and community learning behind it), the
 * bandit's routing_events and the analytics' outcome. The words are planted everywhere a
 * caller could put them, extra fields and a nested outcome field included. Then every
 * document in the project and every log call is searched: no 12-character run of the
 * sentinel may be anywhere. Learned phrases are not kept at all (a hash of a short command is
 * the command): no vocabulary document is written and no hash is stored anywhere, and the
 * same words said again match nothing. The loaded corrections keep their tools.
 *
 * Skips unless FIRESTORE_EMULATOR_HOST is set:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm vitest run \
 *     src/tools/semantic-router/__tests__/router-stores-no-words.emulator.test.ts
 */
import { Firestore, type DocumentData } from '@google-cloud/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ logged: [] as unknown[][], db: undefined as unknown }));

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void h.logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture, trace: capture };
  return {
    ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
    createLogger: () => logger,
    getLogger: () => logger,
  };
});
// Both Firestore handles the router uses point at the emulator project below
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => ({ db: h.db }) }));
vi.mock('../../../utils/firebase-admin-app.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firebase-admin-app.js')>()),
  getAdminFirestore: () => h.db,
}));

import type { SemanticRouterResult } from '../types.js';
import type { RoutingOutcome } from '../integration/routing-analytics.js';
import type { RoutingEvent as BanditEvent } from '../advanced/intelligent/bandit-persistence.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = `demo-router-words-${Date.now().toString(36)}`;
const UID = 'u-router-words';
const SENTINEL = 'remind me to call Dolores about her lupus biopsy results';
const PIECES = Array.from({ length: SENTINEL.length - 11 }, (_, i) => SENTINEL.slice(i, i + 12));
const holdsWords = (value: unknown): string[] => {
  const text = JSON.stringify(value).toLowerCase();
  return PIECES.filter((p) => text.includes(p.toLowerCase()));
};
const DAY = 24 * 60 * 60 * 1000;

function routedTurn(): SemanticRouterResult {
  return {
    intent: { category: 'productivity', specific: SENTINEL, confidence: 0.9 },
    matches: [
      {
        toolId: 'check_calendar',
        confidence: 0.81,
        matchedBy: ['pattern'],
        extractedArgs: { task: SENTINEL },
        missingArgs: [],
        matchReason: `phrase "${SENTINEL}"`,
      },
    ],
    action: { type: 'execute', toolId: 'check_calendar', args: { task: SENTINEL } },
    extractedArgs: { task: SENTINEL },
    metadata: { totalTimeMs: 9, inputText: SENTINEL, normalizedText: SENTINEL.toLowerCase() },
  } as unknown as SemanticRouterResult;
}

const db = () => h.db as Firestore;

/** Every document in the emulator project, by path */
async function everyDoc(): Promise<Record<string, DocumentData>> {
  const out: Record<string, DocumentData> = {};
  const walk = async (cols: FirebaseFirestore.CollectionReference[]): Promise<void> => {
    for (const col of cols) {
      for (const ref of await col.listDocuments()) {
        const snap = await ref.get();
        if (snap.exists) out[ref.path] = snap.data() ?? {};
        await walk(await ref.listCollections());
      }
    }
  };
  await walk(await db().listCollections());
  return out;
}

const count = async (path: string) => (await db().collection(path).get()).size;

describe.skipIf(!emulator)('the router stores keep no caller words (Firestore emulator)', () => {
  let docs: Record<string, DocumentData>;

  beforeAll(async () => {
    h.db = new Firestore({ projectId: PROJECT });
    const loop = await import('../advanced/learning-loop.js');
    const corrections = await import('../learning/correction-store.js');
    const bandit = await import('../advanced/intelligent/bandit-persistence.js');
    const analytics = await import('../integration/routing-analytics.js');
    const persistence = await import('../persistence/firestore-persistence.js');
    await persistence.initializeFirestorePersistence();

    // The caller is routed to the calendar and corrects it to a reminder
    await loop.recordOutcome(
      {
        userId: UID,
        sessionId: 's-1',
        personaId: 'ferni',
        inputText: SENTINEL,
        inputLocale: 'en-US',
        routingResult: routedTurn(),
        conversationHistory: [{ role: 'user', text: SENTINEL }],
        recentTools: ['check_calendar'],
        extra: SENTINEL,
      } as Parameters<typeof loop.recordOutcome>[0],
      {
        actualToolUsed: 'set_reminder',
        wasCorrection: true,
        wasSuccess: true,
        userFeedback: SENTINEL,
      }
    );
    // The two other paths that learned the phrase: a success reinforcing the predicted tool,
    // and an explicit correction (POST /api/intelligence/correction)
    await loop.recordOutcome(
      {
        userId: UID,
        sessionId: 's-1',
        personaId: 'ferni',
        inputText: SENTINEL,
        inputLocale: 'en-US',
        routingResult: routedTurn(),
        conversationHistory: [],
        recentTools: [],
      },
      { actualToolUsed: 'check_calendar', wasCorrection: false, wasSuccess: true }
    );
    await loop.handleExplicitCorrection(UID, SENTINEL, 'check_calendar', 'set_reminder');
    corrections.recordCorrection({
      userId: UID,
      sessionId: 's-1',
      originalQuery: SENTINEL,
      normalizedQuery: SENTINEL.toLowerCase(),
      predictedTool: 'check_calendar',
      predictedConfidence: 0.81,
      predictedArgs: { task: SENTINEL },
      actualTool: 'set_reminder',
      actualArgs: { task: SENTINEL },
      correctionSource: 'user_explicit',
      conversationContext: [SENTINEL],
      personaId: 'ferni',
      feedbackType: 'wrong_tool',
      userFeedback: SENTINEL,
    });
    await bandit.recordRoutingEvent({
      userId: UID,
      sessionId: 's-1',
      personaId: 'ferni',
      inputLength: SENTINEL.length,
      input: SENTINEL,
      selectedTool: 'check_calendar',
      confidence: 0.81,
      decidedBy: 'semantic',
      timestamp: new Date('2026-03-04T10:00:00.000Z'),
    } as BanditEvent);
    const id = analytics.recordRoutingEvent(routedTurn(), {
      userId: UID,
      sessionId: 's-1',
      personaId: 'ferni',
      inputText: SENTINEL,
    });
    analytics.recordRoutingOutcome(id, {
      toolExecuted: 'check_calendar',
      executionSuccess: true,
      llmFallbackUsed: false,
      heard: SENTINEL,
    } as RoutingOutcome);
    await persistence.saveRoutingEvent({
      id: 'route_fixed',
      timestamp: new Date('2026-03-04T10:00:00.000Z'),
      userId: UID,
      sessionId: 's-1',
      personaId: 'ferni',
      inputLength: SENTINEL.length,
      actionType: 'execute',
      latencyMs: 9,
      outcome: {
        toolExecuted: null,
        executionSuccess: true,
        llmFallbackUsed: false,
        heard: SENTINEL,
      },
    } as Parameters<typeof persistence.saveRoutingEvent>[0]);

    // The feedback-store and community writes are fire-and-forget
    await vi.waitFor(
      async () => {
        expect(await count('semantic_routing_feedback')).toBeGreaterThan(0);
        expect(await count(`semantic_routing_corrections/${UID}/corrections`)).toBeGreaterThan(0);
        expect(await count('semantic_router_corrections')).toBeGreaterThan(0);
        expect(await count('semantic_router_community_patterns')).toBeGreaterThan(0);
        expect(await count('routing_events')).toBeGreaterThan(0);
      },
      { timeout: 10_000, interval: 100 }
    );
    docs = await everyDoc();
  });

  it('no stored document holds any part of the words', () => {
    expect(Object.keys(docs).length).toBeGreaterThanOrEqual(7);
    expect(holdsWords(docs)).toEqual([]);
  });

  it('no learned phrase is kept: no vocabulary document, and no hash of the words anywhere', () => {
    expect(Object.keys(docs).filter((p) => p.startsWith('semantic_routing_vocabulary/'))).toEqual(
      []
    );
    // A digest of the words (sha256, an HMAC, an md5) is a run of 32+ hex digits
    const hex = /[0-9a-f]{32,}/i;
    const found: string[] = [];
    const walk = (v: unknown, at: string): void => {
      if (typeof v === 'string' && hex.test(v)) found.push(at);
      if (v && typeof v === 'object' && !(v instanceof Date) && !('toMillis' in v)) {
        for (const [k, x] of Object.entries(v)) {
          if (hex.test(k)) found.push(`${at}.${k}`);
          walk(x, `${at}.${k}`);
        }
      }
    };
    for (const [path, d] of Object.entries(docs)) {
      if (hex.test(path)) found.push(path);
      walk(d, path);
    }
    expect(found).toEqual([]);
  });

  it('no log call holds any part of the words', () => {
    expect(h.logged.length).toBeGreaterThan(0);
    expect(
      holdsWords(h.logged.map((args) => args.map((a) => (a instanceof Error ? a.message : a))))
    ).toEqual([]);
  });

  it('the in-memory outcome keeps its named fields only, and so does the stored one', async () => {
    const analytics = await import('../integration/routing-analytics.js');
    const [event] = analytics.getRoutingEvents();
    expect(event?.outcome).toEqual({
      toolExecuted: 'check_calendar',
      executionSuccess: true,
      llmFallbackUsed: false,
    });
    expect(holdsWords(analytics.getRoutingEvents())).toEqual([]);
    expect(holdsWords(analytics.getDashboardData())).toEqual([]);
    const stored = Object.entries(docs).find(([p]) => p.endsWith('/events/route_fixed'))?.[1];
    expect(stored?.outcome).toEqual({
      toolExecuted: null,
      executionSuccess: true,
      llmFallbackUsed: false,
    });
  });

  it('each store keeps lengths, tools and a 30-day expireAt from its own time', () => {
    const one = (prefix: string) =>
      Object.entries(docs).find(([p]) => p.startsWith(prefix))?.[1] ?? {};
    const expires = (d: DocumentData) => (d.expireAt as FirebaseFirestore.Timestamp).toMillis();
    const fb = one('semantic_routing_feedback/');
    expect(fb).toMatchObject({
      userId: UID,
      inputLength: SENTINEL.length,
      routingResult: { predictedTool: 'check_calendar' },
    });
    expect(expires(fb)).toBe(Date.parse(fb.timestamp as string) + 30 * DAY);
    const corr = one(`semantic_routing_corrections/${UID}/corrections/`);
    expect(corr).toMatchObject({
      inputLength: SENTINEL.length,
      predictedTool: 'check_calendar',
      correctTool: 'set_reminder',
    });
    const routerCorr = one('semantic_router_corrections/');
    expect(routerCorr).toMatchObject({
      queryLength: SENTINEL.length,
      predictedTool: 'check_calendar',
      actualTool: 'set_reminder',
    });
    expect(expires(routerCorr)).toBe(Date.parse(routerCorr.timestamp as string) + 30 * DAY);
    const bandit = one('routing_events/');
    expect(bandit).toMatchObject({ inputLength: SENTINEL.length, selectedTool: 'check_calendar' });
    expect(expires(bandit)).toBe(Date.parse('2026-03-04T10:00:00.000Z') + 30 * DAY);
    const event = one('semantic_router_events/2026-03-04/events/route_fixed');
    expect(expires(event)).toBe(Date.parse('2026-03-04T10:00:00.000Z') + 30 * DAY);
    expect(one('semantic_router_community_patterns/')).toMatchObject({
      incorrectTool: 'check_calendar',
      correctTool: 'set_reminder',
      occurrenceCount: 1,
    });
  });

  it('after a reload, the same words match no learned phrase, and corrections keep their tools', async () => {
    vi.resetModules();
    const loop = await import('../advanced/learning-loop.js');
    const enhanced = await loop.enhanceWithLearning({
      userId: UID,
      sessionId: 's-2',
      personaId: 'ferni',
      inputText: SENTINEL,
      inputLocale: 'en-US',
      routingResult: routedTurn(),
      conversationHistory: [],
      recentTools: [],
    });
    expect(enhanced.boosts.filter((b) => b.source === 'user_vocabulary')).toEqual([]);
    expect(holdsWords(enhanced.boosts)).toEqual([]);

    const corrections = await import('../learning/correction-store.js');
    await corrections.initializeCorrectionStore();
    const loaded = corrections.getCorrections({ userId: UID });
    expect(loaded.map((c) => [c.predictedTool, c.actualTool])).toEqual([
      ['check_calendar', 'set_reminder'],
    ]);
    expect(holdsWords(loaded)).toEqual([]);
  });
});
