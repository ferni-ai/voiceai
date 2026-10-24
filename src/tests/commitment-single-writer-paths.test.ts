/**
 * COMMITMENT_SINGLE_WRITER makes the after-call judge the only writer of the
 * commitments Ferni overhears (#1985), with the real per-turn context builder,
 * the real commitment tools and the real readers. Firestore, the tool wrapper,
 * calendar and outreach are the fakes.
 * - Flag on: the builder stores nothing new on a turn.
 * - A commitment the caller asks a tool for ("remind me to send Jen the deck")
 *   is still stored and still shown, though the flag hides regex-era rows.
 * - Flag off: both write exactly as on main.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedNestedFirestore as fs } from './helpers/nested-firestore.js';
import type { ContextBuilderInput } from '../intelligence/context-builders/core/types.js';
import type { ToolContext } from '../tools/registry/types.js';

vi.mock('firebase-admin/firestore', async () => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    getFirestore: () => sharedNestedFirestore.db,
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
  };
});
vi.mock('../services/superhuman/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../services/superhuman/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});
vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});
vi.mock('../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => [],
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config: { execute: unknown }) => ({ execute: config.execute })) },
}));
vi.mock('../services/outreach/superhuman-outreach-bridge.js', () => ({
  onCommitmentMade: async () => undefined,
  onCommitmentAtRisk: async () => undefined,
}));
vi.mock('../services/superhuman/commitment-calendar-integration.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../services/superhuman/commitment-calendar-integration.js')
  >()),
  validateCommitmentFeasibility: async () => ({ feasible: true, score: 1, conflicts: [] }),
}));

const { buildCommitmentFollowUpContext } =
  await import('../intelligence/context-builders/intelligence/commitment-follow-up.js');
const { commitmentTools } = await import('../tools/domains/productivity/commitments.js');
const { trackCommitmentDef } = await import('../tools/domains/proactive/index.js');
const { loadActiveCommitmentsOrThrow, commitmentCache } =
  await import('../services/superhuman/commitment-store.js');
const { loadCallCheckIns } = await import('../services/superhuman/commitment-follow-up.js');

const UID = 'u-writer';
const START = new Date('2026-10-20T15:00:00Z');
const LATER = START.getTime() + 10 * 86_400_000;
const PATH = `bogle_users/${UID}/commitments`;
const rows = () => fs.docsIn(PATH);

/** A regex-era row, as the turn path stored them on prod. */
const LEGACY = {
  userId: UID,
  statement: "I'm gonna sign off now",
  summary: 'sign off now',
  status: 'active',
  createdAt: START.getTime() - 86_400_000,
  followUpAfter: START.getTime(),
  followUpCount: 0,
};

/** One user turn through the real builder. */
async function userSays(text: string) {
  const input = {
    userText: text,
    analysis: { emotion: { primary: 'neutral' } },
    services: { userId: UID, sessionId: 'call-1' },
    userData: { turnCount: 3 },
  } as unknown as ContextBuilderInput;
  return (await buildCommitmentFollowUpContext(input)).map((i) => i.content).join('\n');
}

type Exec = (p: Record<string, unknown>) => Promise<string>;
function tool(tools: Array<{ id: string; create: (c: ToolContext) => unknown }>, id: string): Exec {
  const def = tools.find((t) => t.id === id);
  return (def?.create({ userId: UID } as ToolContext) as { execute: Exec }).execute;
}
const record = () => tool(commitmentTools, 'recordCommitment');
const track = () => tool([trackCommitmentDef], 'trackCommitment');
const DECK = {
  statement: "remind me I'll send Jen the deck tomorrow",
  summary: 'send Jen the deck',
};

beforeEach(() => {
  fs.store.clear();
  commitmentCache.delete(UID);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  fs.store.set(`${PATH}/legacy-1`, { ...LEGACY });
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.COMMITMENT_SINGLE_WRITER;
});

describe('the per-turn context builder', () => {
  it('flag off: stores the commitment it hears, as on main', async () => {
    const said = await userSays("I'm going to call my mom this weekend");
    expect(said).toContain('[USER COMMITMENT]');
    const added = rows().filter((r) => r.content === 'call my mom this weekend');
    expect(added).toHaveLength(1);
    expect(added[0]).not.toHaveProperty('source');
  });

  it('flag on: stores nothing new and claims no tracking (the after-call judge writes)', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    const said = await userSays("I'm going to call my mom this weekend");
    expect(said).not.toContain('[USER COMMITMENT]');
    expect(rows()).toEqual([LEGACY]);
  });
});

describe('a commitment the caller asks a tool for', () => {
  it('flag off: written as on main, and every reader shows legacy rows too', async () => {
    await record()(DECK);
    const stored = rows().find((r) => r.summary === 'send Jen the deck');
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty('source');
    const shown = (await loadActiveCommitmentsOrThrow(UID)).map((c) => c.summary);
    expect(shown.sort()).toEqual(['send Jen the deck', 'sign off now']);
  });

  it('flag on, recordCommitment: still stored and shown, while the legacy row is hidden', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    expect(await record()(DECK)).toMatch(/^Got it/);
    expect(rows().find((r) => r.summary === 'send Jen the deck')).toMatchObject({
      source: 'user-request',
    });
    // /api/commitments, loadUserCommitments and the getCommitments tool read this.
    expect((await loadActiveCommitmentsOrThrow(UID)).map((c) => c.summary)).toEqual([
      'send Jen the deck',
    ]);
    // The next call's check-in asks about it, and not about "sign off".
    const asked = await loadCallCheckIns(UID, undefined, LATER);
    expect(asked.map((c) => c.statement)).toEqual(['send Jen the deck tomorrow']);
  });

  it('flag on, trackCommitment: still stored and shown', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    await track()({ summary: 'send Jen the deck by Friday', type: 'promise' });
    expect((await loadActiveCommitmentsOrThrow(UID)).map((c) => c.summary)).toEqual([
      'send Jen the deck by Friday',
    ]);
  });
});
