/**
 * The once-claims on a placed call's record, against the Firestore emulator: when
 * several workers race to tell the same thing (CALL_LIVE_RELAY's progress line, or
 * the end-of-call report), exactly one wins. live-report-record.ts claimOnCallDoc
 * reads and writes the claim in ONE transaction. A get, then an update, outside a
 * transaction lets every racer win, and no in-memory fake runs claims concurrently
 * enough to see that, so this runs on the real client and emulator.
 *
 * Each racer is its own module graph (its own in-memory claim set, as a separate
 * worker has), so only the transaction can stop a second winner.
 * Skips unless FIRESTORE_EMULATOR_HOST is set (CI: data-layer-e2e.yml, firestore-e2e):
 *
 *   firebase emulators:exec --only firestore --project demo-claim \
 *     "pnpm vitest run -c vitest.config.unit.ts src/services/outreach/__tests__/call-claim-race.emulator.test.ts"
 */
import { Firestore } from '@google-cloud/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const handle = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => handle.db }));

const ON = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const db = new Firestore({ projectId: `demo-claim-${Date.now()}`, databaseId: '(default)' });
handle.db = db;

const RACERS = 5;
const ROUNDS = 5;
// Contended transactions retry with backoff on the emulator: ~16 s for 5 rounds locally.
const RACE_MS = 120_000;
const UID = 'uid-riley-test';

type Record_ = typeof import('../live-report-record.js');
const workers: Record_[] = [];

const callRef = (callId: string) =>
  db.collection('bogle_users').doc(UID).collection('on_behalf_calls').doc(callId);

/** All racers at once, released together; how many won. */
async function race(claim: (worker: Record_) => Promise<boolean>): Promise<number> {
  let go: () => void = () => undefined;
  const start = new Promise<void>((resolve) => {
    go = resolve;
  });
  const runs = workers.map(async (worker) => {
    await start;
    return claim(worker);
  });
  go();
  return (await Promise.all(runs)).filter(Boolean).length;
}

describe.skipIf(!ON)('once-claims on the call record, raced by several workers', () => {
  beforeAll(async () => {
    for (let i = 0; i < RACERS; i++) {
      vi.resetModules();
      // eslint-disable-next-line no-await-in-loop -- one module graph per worker, in turn
      workers.push(await import('../live-report-record.js'));
    }
  });

  it(
    `the progress line: ${RACERS} racers, exactly one winner in each of ${ROUNDS} rounds`,
    async () => {
      const field = 'progress.answeredTold';
      const taken = (data: Record<string, unknown> | undefined): boolean =>
        (data?.progress as Record<string, unknown> | undefined)?.answeredTold !== undefined;
      for (let round = 0; round < ROUNDS; round++) {
        const callId = `c-race-progress-${round}`;
        // eslint-disable-next-line no-await-in-loop -- rounds are sequential
        await callRef(callId).set({ callId, progress: { answeredAt: new Date().toISOString() } });
        // eslint-disable-next-line no-await-in-loop -- rounds are sequential
        const winners = await race((w) => w.claimOnCallDoc(UID, callId, field, taken, 'RACE'));
        expect(winners, `round ${round}`).toBe(1);
        // eslint-disable-next-line no-await-in-loop -- rounds are sequential
        const stored = (await callRef(callId).get()).data();
        expect(stored?.progress?.answeredTold).toEqual(expect.any(String));
      }
    },
    RACE_MS
  );

  it(
    `the end-of-call report: ${RACERS} racers, exactly one winner in each of ${ROUNDS} rounds`,
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const callId = `c-race-report-${round}`;
        // eslint-disable-next-line no-await-in-loop -- rounds are sequential
        await callRef(callId).set({ callId, userId: UID });
        // eslint-disable-next-line no-await-in-loop -- rounds are sequential
        const winners = await race((w) => w.claimVoiceReport(UID, callId));
        expect(winners, `round ${round}`).toBe(1);
      }
    },
    RACE_MS
  );
});
