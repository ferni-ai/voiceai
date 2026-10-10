/**
 * The temporal world model on the live recall path: what one call told us
 * goes through the real after-call sink into a store, and the next call's
 * createMemoryRecall loads it at call start and puts it in the first note.
 * Only the stores (and the clock) are fakes.
 */
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ msg: string; data: Record<string, unknown> }>);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger: Record<string, unknown> = {
    info: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  };
  logger.child = () => logger;
  return { createLogger: () => logger, getLogger: () => logger };
});
// No Firestore: the ledger and life updates load nothing.
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { createMemoryRecall } from '../memory-recall-hook.js';
import { recordWorldObservations } from '../../../intelligence/world-model/temporal/ingest.js';
import { loadTemporalWorld } from '../../../intelligence/world-model/temporal/load.js';
import { createMemoryWorldFactStore } from '../../../intelligence/world-model/temporal/__tests__/memory-store.js';

const ON = { WORLD_MODEL_TEMPORAL: 'on' };
const TZ = 'America/New_York';
// Call 1, Saturday 10-10: "Mindy's knee surgery is Tuesday." Call 2: Wednesday 10-14.
const CALL1_AT = '2026-10-10T18:00:00.000Z';
const CALL1_END = '2026-10-10T18:20:00.000Z';
const CALL2_AT = new Date('2026-10-14T14:00:00.000Z');

async function afterCall1() {
  const store = createMemoryWorldFactStore();
  await recordWorldObservations(
    'u1',
    's1',
    [
      {
        subject: 'Mindy',
        subjectKind: 'person',
        relation: 'sister',
        attribute: 'event',
        value: 'knee surgery',
        eventDate: '2026-10-13',
        observedAt: CALL1_AT,
        confidence: 0.9,
        source: { kind: 'summary', sessionId: 's1' },
      },
    ],
    { store, env: ON, judge: async () => [] }
  );
  return store;
}

function call2(
  store: ReturnType<typeof createMemoryWorldFactStore>,
  env: Record<string, string>,
  followUps: string[] = []
) {
  const calls: Array<{ timeZone?: string }> = [];
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    env,
    timeZone: TZ,
    store: {
      facts: async () => [{ entityName: 'Sam', key: 'job', value: 'nurse', confidence: 1 }],
      summaries: async () => [{ followUpItems: followUps }],
    },
    loadTemporalWorld: (userId, options) => {
      calls.push({ timeZone: options?.timeZone });
      return loadTemporalWorld(userId, {
        ...options,
        store,
        now: CALL2_AT,
        lastCallEndedAt: async () => CALL1_END,
      });
    },
  });
  return { recall, calls };
}

describe('temporal world on the live recall path', () => {
  it('call start loads it; the first note says the surgery was yesterday, once', async () => {
    const store = await afterCall1();
    logged.length = 0;
    const { recall, calls } = call2(store, ON);
    await recall.ready;

    expect(calls).toEqual([{ timeZone: TZ }]);
    const first = recall.noteFor("Hey, it's me again.") ?? '';
    expect(first).toContain('[SINCE YOU LAST TALKED]');
    expect(first).toContain('Mindy (sister): knee surgery was yesterday. Ask how it went.');
    expect(first).toContain('[GOING ON IN THEIR WORLD NOW]');
    expect(logged.filter((l) => l.msg === 'WORLD_TEMPORAL_INJECTED')).toHaveLength(1);

    recall.newTurn();
    expect(recall.noteFor('Long couple of days, honestly.') ?? '').not.toContain('SINCE YOU');
  });

  it('an open thread from the last summary already asks it: no "since" repeat', async () => {
    const store = await afterCall1();
    const { recall } = call2(store, ON, ["Ask how Mindy's knee surgery went"]);
    await recall.ready;
    const first = recall.noteFor("Hey, it's me again.") ?? '';
    expect(first).not.toContain('[SINCE YOU LAST TALKED]');
    expect(first).toContain("Ask how Mindy's knee surgery went");
  });

  it('with WORLD_MODEL_TEMPORAL off nothing is loaded or said', async () => {
    const store = await afterCall1();
    const { recall, calls } = call2(store, {});
    await recall.ready;
    expect(calls).toEqual([]);
    expect(recall.noteFor("Hey, it's me again.") ?? '').not.toContain('knee surgery');
  });
});
