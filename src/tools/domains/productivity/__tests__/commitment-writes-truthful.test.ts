/**
 * COMMITMENT_WRITES_TRUTHFUL (#4263): when a commitment status update fails to reach Firestore,
 * the commitment tools say they couldn't, and the commitment is unchanged in Firestore and in the
 * process cache. Off, as on main: they celebrate. Real tools and the real updateCommitmentStatus
 * over an in-memory Firestore whose updates can be made to fail. Every name here is made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { failWrites: false };
  const doc = (path: string): Record<string, unknown> => ({
    collection: (name: string) => ({ doc: (id: string) => doc(`${path}/${name}/${id}`) }),
    update: async (fields: Record<string, unknown>) => {
      if (state.failWrites) throw new Error('write failed');
      docs.set(path, { ...(docs.get(path) ?? {}), ...fields });
    },
  });
  return {
    docs,
    state,
    db: { collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }) },
  };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => fs.db,
}));

const { commitmentCache } = await import('../../../../services/superhuman/commitment-store.js');
const keeper = await import('../../../../services/superhuman/commitment-keeper.js');
const { commitmentTools } = await import('../commitments.js');
const { definitions: trackingTools } = await import('../../commitment-tracking/index.js');
const { definitions: proactiveTools } = await import('../../proactive/index.js');

type Commitment = Awaited<ReturnType<typeof keeper.loadUserCommitments>>[number];
const COULDNT = /\bcouldn't\b|\bhad trouble\b/i;
let n = 0;
let uid = '';
const ID = 'commitment-fern-walk';
const path = (): string => `bogle_users/${uid}/commitments/${ID}`;

beforeEach(() => {
  uid = `riley-test-${++n}`;
  fs.state.failWrites = false;
  fs.docs.set(path(), { status: 'active' });
  const now = Date.now();
  const walk: Commitment = {
    id: ID,
    userId: uid,
    statement: 'I am going to walk the fern trail',
    summary: 'walk the fern trail',
    text: 'I am going to walk the fern trail',
    type: 'intention',
    emotionalWeight: 0.3,
    createdAt: now,
    lastMentioned: now,
    followUpAfter: now,
    status: 'active',
    followUpCount: 0,
  };
  commitmentCache.set(uid, [walk]);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const on = (): void => {
  vi.stubEnv('COMMITMENT_WRITES_TRUTHFUL', 'on');
};

type Defs = ReadonlyArray<{ id: string; create: (ctx: never) => unknown }>;
async function run(defs: Defs, id: string, args: Record<string, unknown>): Promise<string> {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const tool = def.create({ userId: uid, agentId: 'ferni' } as never) as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return String(await tool.execute(args, {}));
}

/** The commitment's status in Firestore and in the process cache. */
const statuses = (): [unknown, unknown] => [
  fs.docs.get(path())?.status,
  commitmentCache.get(uid)?.find((c) => c.id === ID)?.status,
];

const complete = { commitmentQuery: 'fern trail' };
const update = { commitmentId: ID, newStatus: 'completed' };
const celebrate = { commitmentSummary: 'walk the fern trail' };

describe('a failed status update, flag on', () => {
  beforeEach(() => {
    on();
    fs.state.failWrites = true;
  });

  it("completeCommitment says it couldn't, and the commitment is still active", async () => {
    expect(await run(commitmentTools, 'completeCommitment', complete)).toBe(
      `I couldn't mark "walk the fern trail" as done just now, so it's still on your list. Want me to try again?`
    );
    expect(statuses()).toEqual(['active', 'active']);
  });

  it("deferCommitment says it couldn't, and the commitment is still active", async () => {
    expect(await run(commitmentTools, 'deferCommitment', { commitmentQuery: 'fern trail' })).toBe(
      `I couldn't put "walk the fern trail" on hold just now. It's still active.`
    );
    expect(statuses()).toEqual(['active', 'active']);
  });

  it('updateCommitment says it had trouble, and the commitment is still active', async () => {
    expect(await run(trackingTools, 'updateCommitment', update)).toBe(
      "I had trouble updating that commitment. Let's try again."
    );
    expect(statuses()).toEqual(['active', 'active']);
  });

  it("celebrateCompletion says it couldn't instead of celebrating", async () => {
    const reply = await run(proactiveTools, 'celebrateCompletion', celebrate);
    expect(reply).toBe("I couldn't mark that as done just now. Want me to try again?");
    expect(statuses()).toEqual(['active', 'active']);
  });

  it('celebrateCompletion with no matching commitment writes nothing and celebrates, as on main', async () => {
    const reply = await run(proactiveTools, 'celebrateCompletion', {
      commitmentSummary: 'sing at dawn',
    });
    expect(reply).toMatch(/^\*\*🎉 You did it!\*\*/);
    expect(statuses()).toEqual(['active', 'active']);
  });

  it('updateCommitmentStatus reports false', async () => {
    expect(await keeper.updateCommitmentStatus(uid, ID, 'completed')).toBe(false);
  });
});

describe('off: the same failures, as on main', () => {
  beforeEach(() => {
    fs.state.failWrites = true;
  });

  it('every tool still celebrates, though nothing changed', async () => {
    expect(await run(commitmentTools, 'completeCommitment', complete)).toBe(
      'Nice! "walk the fern trail" is done. Way to follow through.'
    );
    expect(await run(commitmentTools, 'deferCommitment', complete)).toMatch(
      /^No problem\. I've put "walk the fern trail" on hold\./
    );
    expect(await run(trackingTools, 'updateCommitment', update)).toMatch(/^That's amazing!/);
    expect(await run(proactiveTools, 'celebrateCompletion', celebrate)).toMatch(
      /^\*\*🎉 You did it!\*\*/
    );
    expect(statuses()).toEqual(['active', 'active']);
    expect(await keeper.updateCommitmentStatus(uid, ID, 'completed')).toBe(true);
  });
});

describe('flag on, healthy store', () => {
  it('completeCommitment completes it and celebrates', async () => {
    on();
    expect(await run(commitmentTools, 'completeCommitment', complete)).not.toMatch(COULDNT);
    expect(statuses()).toEqual(['completed', 'completed']);
  });

  it('updateCommitment marks it and says so', async () => {
    on();
    expect(await run(trackingTools, 'updateCommitment', update)).toMatch(/^That's amazing!/);
    expect(statuses()).toEqual(['completed', 'completed']);
  });
});
