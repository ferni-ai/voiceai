/**
 * Peter's "predict my week" game (weeklyPrediction), each action against the
 * real engagement store on an in-memory Firestore, and the web push that
 * follows a save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../../../services/engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
}));

import {
  getEngagementStore,
  resetEngagementStore,
} from '../../../../services/engagement/engagement-store.js';
import { getEngagementDataSender } from '../../../../services/engagement/engagement-data-sender.js';
import type { ToolContext } from '../../../registry/types.js';
import { weeklyPredictionDef } from '../analytics-games.js';

const USER = 'user-predict-1';
type Result = Record<string, unknown>;
type Args = {
  action: 'make-predictions' | 'save-predictions' | 'get-pending' | 'record-actuals';
  predictions?: Record<string, number>;
  actuals?: Record<string, number>;
  predictionId?: string;
};

const ctx = {
  userId: USER,
  agentId: 'peter-john',
  agentDisplayName: 'Peter',
} as unknown as ToolContext;

function run(args: Args): Promise<Result> {
  const tool = weeklyPredictionDef.create(ctx) as unknown as {
    execute: (a: Args) => Promise<Result>;
  };
  return tool.execute(args);
}

async function stored() {
  return (await getEngagementStore()).getRecentPredictions(USER, 10);
}

/** What the web panel was sent, in order. */
const published: Array<Record<string, unknown>> = [];
const room = {
  localParticipant: {
    publishData: async (data: Uint8Array) => {
      published.push(JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>);
    },
  },
};
const lastPredictionsPushed = () =>
  (published.filter((m) => m.type === 'engagement').at(-1)?.predictions ?? null) as Array<{
    id: string;
    status: string;
    metrics: Array<{ key: string; predicted: number; actual?: number }>;
  }> | null;

let firestore: FakeEngagementFirestore;

beforeEach(() => {
  firestore = createFakeEngagementFirestore();
  firestore.docs.set(`bogle_users/${USER}`, { name: 'live' }); // erased accounts take no writes
  fake.db = firestore.db;
  resetEngagementStore();
  published.length = 0;
  getEngagementDataSender().setRoom(room);
});

afterEach(() => {
  getEngagementDataSender().clearRoom();
});

describe('weeklyPrediction', () => {
  it('make-predictions offers the five categories and saves nothing', async () => {
    const result = await run({ action: 'make-predictions' });

    expect(result.categories).toEqual([
      'Deep work hours',
      'Exercise sessions',
      'Social time (hours)',
      'Screen time (hours)',
      'Mood average (1-10)',
    ]);
    expect(result.instruction).toMatch(/save-predictions/);
    expect(await stored()).toEqual([]);
  });

  it('save-predictions stores the prediction and the push after it carries it', async () => {
    await getEngagementDataSender().sendEngagementData(USER);
    expect(lastPredictionsPushed()).toEqual([]);

    const result = await run({
      action: 'save-predictions',
      predictions: { 'Deep work hours': 6, 'Exercise sessions': 3 },
    });

    expect(result).toMatchObject({ saved: true });
    const [saved] = await stored();
    expect(saved).toMatchObject({
      id: result.predictionId,
      predictions: { 'Deep work hours': 6, 'Exercise sessions': 3 },
    });
    expect(saved.completedAt).toBeUndefined();
    expect(lastPredictionsPushed()).toEqual([
      expect.objectContaining({
        id: result.predictionId,
        status: 'pending',
        metrics: [
          { key: 'Deep work hours', predicted: 6 },
          { key: 'Exercise sessions', predicted: 3 },
        ],
      }),
    ]);
  });

  it('save-predictions says it did not save when the write fails', async () => {
    firestore.failWrites.match = /\/predictions\//;

    const result = await run({ action: 'save-predictions', predictions: { 'Deep work hours': 6 } });

    expect(result).toMatchObject({ saved: false, error: expect.any(String) });
    expect(String(result.response ?? '')).not.toMatch(/locked in/i);
    expect(String(result.instruction)).toMatch(/couldn't save/);
    expect(await stored()).toEqual([]);
    expect(lastPredictionsPushed()).toBeNull();
  });

  it('get-pending finds an open prediction only once one is saved', async () => {
    expect(await run({ action: 'get-pending' })).toMatchObject({ hasPending: false });

    const { predictionId } = await run({
      action: 'save-predictions',
      predictions: { 'Deep work hours': 6 },
    });
    const pending = await run({ action: 'get-pending' });

    expect(pending).toMatchObject({
      hasPending: true,
      pendingCount: 1,
      oldestPrediction: { id: predictionId, predictions: { 'Deep work hours': 6 } },
    });
  });

  it('record-actuals scores and closes the open prediction', async () => {
    const { predictionId } = await run({
      action: 'save-predictions',
      predictions: { 'Deep work hours': 6, 'Exercise sessions': 4 },
    });
    expect((await stored())[0].completedAt).toBeUndefined();

    const result = await run({
      action: 'record-actuals',
      actuals: { 'Deep work hours': 6, 'Exercise sessions': 2 },
    });

    expect(result).toMatchObject({ resolved: true, predictionId, accuracy: 75 });
    const [closed] = await stored();
    expect(closed.completedAt).toEqual(expect.any(String));
    expect(closed).toMatchObject({
      accuracy: 75,
      actuals: { 'Deep work hours': 6, 'Exercise sessions': 2 },
    });
    expect(await run({ action: 'get-pending' })).toMatchObject({ hasPending: false });
    expect(lastPredictionsPushed()?.[0]).toMatchObject({ id: predictionId, status: 'resolved' });
  });

  it('record-actuals with no open prediction records nothing', async () => {
    const result = await run({ action: 'record-actuals', actuals: { 'Deep work hours': 6 } });

    expect(result).toMatchObject({ error: 'No pending prediction found' });
    expect(await stored()).toEqual([]);
  });
});
