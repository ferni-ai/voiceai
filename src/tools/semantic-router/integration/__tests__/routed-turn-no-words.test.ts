/**
 * A routed turn keeps no caller words in analytics, Firestore or logs (Seth, 2026-11-12:
 * lengths only), and a crisis turn leaves only a count. Every routed turn calls
 * recordRoutedTurn, which keeps a prediction for the correction capture and a routing
 * event (memory and Firestore). When the LLM then runs a different tool, the capture
 * hands the correction, words included, to the in-memory learning engine: that stays on
 * for ordinary turns and never happens for a crisis turn.
 *
 * Each test sends a fictional line through and checks every place a turn can land: the
 * routing events, the dashboard, the Firestore writes, the learning engine and the logs.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
const writes = vi.hoisted(() => [] as Array<{ path: string; data: Data }>);
const learned = vi.hoisted(() => [] as unknown[]);
const logged = vi.hoisted(() => [] as unknown[][]);

/** A Firestore that records each document set, with its full path */
const fakeDb = vi.hoisted(() => {
  const collection = (path: string): unknown => ({
    doc: (id: string) => ({
      id,
      set: async (data: Data) => void writes.push({ path: `${path}/${id}`, data }),
      collection: (name: string) => collection(`${path}/${id}/${name}`),
    }),
  });
  return { collection };
});
vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ db: fakeDb }),
}));
vi.mock('../../learning/online-learning-loop.js', () => ({
  getOnlineLearningEngine: () => ({
    addCorrection: async (example: unknown) => void learned.push(example),
  }),
}));
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture, trace: capture };
  return {
    ...(await importOriginal<object>()),
    createLogger: () => logger,
    getLogger: () => logger,
  };
});

import type { SemanticRouterResult } from '../../types.js';
import { clearRoutingEvents, getDashboardData, getRoutingEvents } from '../routing-analytics.js';
import { recordRoutedTurn } from '../routed-turn.js';
import { recordActualToolExecution } from '../../learning/implicit-correction-capture.js';
import { initializeFirestorePersistence } from '../../persistence/firestore-persistence.js';

const ORDINARY = 'remind me to water the ferns on thursday morning';
const CRISIS = "i can't do this anymore and i want it all to stop tonight";

/** No 12-character run of the line may be kept in what a turn leaves behind */
function piecesOf(line: string): string[] {
  return Array.from({ length: line.length - 11 }, (_, i) => line.slice(i, i + 12));
}
function keptPieces(line: string, where: Record<string, unknown>): string[] {
  const kept = JSON.stringify(where).toLowerCase();
  return piecesOf(line).filter((p) => kept.includes(p));
}
/** Analytics, Firestore and logs: never the words, on any turn */
function stored(): Record<string, unknown> {
  return { events: getRoutingEvents(), dashboard: getDashboardData(), writes, logged };
}

/** The fields a routing event's Firestore document has (saveRoutingEvent's allowlist) */
const EVENT_DOC_KEYS = [
  'actionType',
  'confidence',
  'expireAt',
  'id',
  'inputLength',
  'intentCategory',
  'latencyMs',
  'matchedBy',
  'personaId',
  'sessionId',
  'timestamp',
  'toolId',
  'userId',
];

/** A router result that carries the line in every field a result can */
function routed(line: string): SemanticRouterResult {
  return {
    intent: {
      category: 'productivity' as SemanticRouterResult['intent']['category'],
      specific: line,
      confidence: 0.9,
      mood: 'command',
      urgency: 'normal',
    },
    matches: [
      {
        toolId: 'set_reminder',
        confidence: 0.87,
        matchedBy: ['pattern', 'embedding'],
        layerScores: { pattern: 0.9, embedding: 0.8 } as never,
        extractedArgs: { task: line },
        missingArgs: [],
        matchReason: `phrase "${line}"`,
        metadata: { heard: line },
      },
    ],
    action: { type: 'hint', toolId: 'set_reminder', args: { task: line } } as never,
    extractedArgs: { task: line },
    metadata: {
      totalTimeMs: 12,
      layerTimesMs: { pattern: 2, embedding: 10 } as never,
      toolsConsidered: 40,
      inputText: line,
      normalizedText: line,
      contextUsed: [line],
      routerVersion: 'test',
    },
  };
}

/** The turn is routed, then the LLM runs a different tool: the correction capture's case */
async function routeThenCorrect(line: string, sessionId: string, crisisTurn = false) {
  const eventId = recordRoutedTurn(routed(line), {
    userId: 'u-test',
    sessionId,
    personaId: 'ferni',
    inputText: line,
    crisisTurn,
  });
  const corrected = await recordActualToolExecution(sessionId, 'play_music', 'native_fc');
  await vi.waitFor(() => expect(writes).toHaveLength(eventId ? 1 : 0));
  return { eventId, corrected };
}

beforeAll(async () => {
  await initializeFirestorePersistence();
});

beforeEach(() => {
  writes.length = 0;
  learned.length = 0;
  logged.length = 0;
  clearRoutingEvents();
});

describe('an ordinary routed turn', () => {
  it('keeps its length and route ids, and the correction reaches learning', async () => {
    const { eventId, corrected } = await routeThenCorrect(ORDINARY, 's-ordinary');

    expect(eventId).toBeDefined();
    expect(corrected).toBe(true);
    expect(getRoutingEvents()).toEqual([
      expect.objectContaining({ id: eventId, inputLength: ORDINARY.length }),
    ]);
    expect(writes[0].data).toMatchObject({ inputLength: ORDINARY.length, toolId: 'set_reminder' });
    expect(learned).toEqual([
      expect.objectContaining({ query: ORDINARY, predictedToolId: 'set_reminder' }),
    ]);
    expect(keptPieces(ORDINARY, stored())).toEqual([]);
    // The check can fail: learning is the one place the words go
    expect(keptPieces(ORDINARY, { learned })).not.toEqual([]);
  });

  it('writes the same event document as before: lengths, ids and scores', async () => {
    const { eventId } = await routeThenCorrect(ORDINARY, 's-same');

    expect(Object.keys(writes[0].data).sort()).toEqual(EVENT_DOC_KEYS);
    expect(writes[0].data).toEqual({
      id: eventId,
      userId: 'u-test',
      sessionId: 's-same',
      personaId: 'ferni',
      inputLength: ORDINARY.length,
      intentCategory: 'productivity',
      actionType: 'hint',
      toolId: 'set_reminder',
      confidence: 0.87,
      matchedBy: ['pattern', 'embedding'],
      latencyMs: 12,
      timestamp: expect.anything(),
      expireAt: expect.any(Date),
    });
  });
});

describe('a crisis routed turn', () => {
  it('leaves only a count', async () => {
    const { eventId, corrected } = await routeThenCorrect(CRISIS, 's-crisis', true);

    expect(eventId).toBeUndefined();
    expect(corrected).toBe(false); // no prediction was kept to compare against
    expect(getRoutingEvents()).toEqual([]);
    expect(writes).toEqual([]);
    expect(learned).toEqual([]);
    expect(getDashboardData().crisisTurns).toBe(1);
    expect(keptPieces(CRISIS, { ...stored(), learned })).toEqual([]);
  });

  it('drops the turn before it, so a tool run on the crisis turn is not learned', async () => {
    const turn = { userId: 'u-test', sessionId: 's-after', personaId: 'ferni' };
    recordRoutedTurn(routed(ORDINARY), { ...turn, inputText: ORDINARY });
    recordRoutedTurn(routed(CRISIS), { ...turn, inputText: CRISIS, crisisTurn: true });
    const corrected = await recordActualToolExecution('s-after', 'play_music', 'native_fc');
    await vi.waitFor(() => expect(writes).toHaveLength(1)); // the ordinary turn's event

    expect(corrected).toBe(false);
    expect(learned).toEqual([]);
    expect(getDashboardData().crisisTurns).toBe(1);
  });
});
