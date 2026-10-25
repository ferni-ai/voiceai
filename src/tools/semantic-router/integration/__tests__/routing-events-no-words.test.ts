/**
 * Routing analytics keep no caller words (Seth, 2026-10-24). Every routed turn calls
 * recordRoutingEvent, which keeps the event in memory (getDashboardData().recentEvents)
 * and writes it to semantic_router_events/{day}/events/{id}. The result it is handed
 * carries the words in many places (the input, the normalized input, the matched words in
 * intent.specific, a tool's extracted args and match reason, an action's args and question),
 * so each test plants one sentinel in all of them and checks no part of it is kept.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
const writes = vi.hoisted(() => [] as Array<{ path: string; data: Data }>);

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

import type { SemanticRouterResult } from '../../types.js';
import {
  clearRoutingEvents,
  getDashboardData,
  getRoutingEvents,
  getRoutingStats,
  recordRoutingEvent,
} from '../routing-analytics.js';
import {
  initializeFirestorePersistence,
  ROUTING_EVENT_RETENTION_MS,
  saveRoutingEvent,
  type PersistedRoutingEvent,
} from '../../persistence/firestore-persistence.js';

const SENTINEL = 'remind me to call Dolores about her lupus biopsy';
/** A truncated snippet is still the words: no 12-character run of the sentinel may be kept */
const PIECES = Array.from({ length: SENTINEL.length - 11 }, (_, i) => SENTINEL.slice(i, i + 12));
const holdsWords = (value: unknown): string[] => {
  const text = JSON.stringify(value).toLowerCase();
  return PIECES.filter((p) => text.includes(p.toLowerCase()));
};

function routedTurn(): SemanticRouterResult {
  return {
    intent: {
      category: 'productivity' as SemanticRouterResult['intent']['category'],
      specific: SENTINEL,
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
        extractedArgs: { task: SENTINEL },
        missingArgs: [],
        matchReason: `phrase "${SENTINEL}"`,
        metadata: { heard: SENTINEL },
      },
    ],
    action: {
      type: 'confirm',
      toolId: 'set_reminder',
      args: { task: SENTINEL },
      question: `Should I ${SENTINEL}?`,
    },
    extractedArgs: { task: SENTINEL },
    metadata: {
      totalTimeMs: 12,
      layerTimesMs: { pattern: 2, embedding: 10 } as never,
      toolsConsidered: 40,
      inputText: SENTINEL,
      normalizedText: SENTINEL.toLowerCase(),
      contextUsed: [SENTINEL],
      routerVersion: 'test',
    },
  };
}

const record = () =>
  recordRoutingEvent(routedTurn(), {
    userId: 'u-test',
    sessionId: 's-test',
    personaId: 'ferni',
    inputText: SENTINEL,
  });

beforeAll(async () => {
  await initializeFirestorePersistence();
});

beforeEach(() => {
  writes.length = 0;
  clearRoutingEvents();
});

describe('routing events keep no caller words', () => {
  it('the stored event holds the tool, scores and length, and no part of the words', async () => {
    expect(writes).toHaveLength(0);
    const id = record();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const [{ path, data }] = writes;

    expect(path).toMatch(new RegExp(`^semantic_router_events/\\d{4}-\\d{2}-\\d{2}/events/${id}$`));
    expect(holdsWords(data)).toEqual([]);
    expect(Object.keys(data).sort()).toEqual(
      [
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
      ].sort()
    );
    expect(data).toMatchObject({
      inputLength: SENTINEL.length,
      intentCategory: 'productivity',
      actionType: 'confirm',
      toolId: 'set_reminder',
      confidence: 0.87,
      matchedBy: ['pattern', 'embedding'],
      latencyMs: 12,
      userId: 'u-test',
    });
  });

  it('gives each stored event a 30-day expireAt, as a Date (a Timestamp for the TTL policy)', async () => {
    const before = Date.now();
    record();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const { expireAt } = writes[0].data;
    expect(expireAt).toBeInstanceOf(Date);
    const at = (expireAt as Date).getTime();
    expect(at).toBeGreaterThanOrEqual(before + ROUTING_EVENT_RETENTION_MS);
    expect(at).toBeLessThanOrEqual(Date.now() + ROUTING_EVENT_RETENTION_MS);
    expect(ROUTING_EVENT_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('the in-memory event, the dashboard and the raw export keep no part of the words', () => {
    record();
    const [event] = getRoutingEvents();
    expect(event).toMatchObject({
      inputLength: SENTINEL.length,
      actionType: 'confirm',
      topMatch: { toolId: 'set_reminder', confidence: 0.87 },
      intent: { category: 'productivity', mood: 'command' },
    });
    expect(holdsWords(getRoutingEvents())).toEqual([]);
    expect(holdsWords(getDashboardData())).toEqual([]);
  });

  it('the stats still count the action and the tool', () => {
    record();
    record();
    const stats = getRoutingStats();
    expect(stats.totalRoutes).toBe(2);
    expect(stats.toolUsageDistribution).toEqual({ set_reminder: 2 });
    expect(stats.categoryDistribution).toEqual({ productivity: 2 });
  });

  it('saveRoutingEvent writes only its own fields, whatever a caller adds', async () => {
    const event = {
      id: 'route_extra',
      timestamp: new Date(),
      userId: 'u-test',
      sessionId: 's-test',
      personaId: 'ferni',
      inputLength: SENTINEL.length,
      actionType: 'hint',
      latencyMs: 3,
      inputText: SENTINEL,
      normalizedText: SENTINEL,
      outcome: {
        toolExecuted: null,
        executionSuccess: false,
        llmFallbackUsed: true,
        heard: SENTINEL,
      },
    } as PersistedRoutingEvent;
    await saveRoutingEvent(event);
    expect(writes).toHaveLength(1);
    expect(holdsWords(writes[0].data)).toEqual([]);
    expect(writes[0].data).toMatchObject({
      id: 'route_extra',
      actionType: 'hint',
      outcome: { executionSuccess: false, llmFallbackUsed: true },
    });
  });
});
