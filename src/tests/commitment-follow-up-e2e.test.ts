/**
 * The user's own commitments, end to end, with the real commitment-follow-up
 * context builder and the real reply hook every spoken reply goes through
 * (trackFerniCommitments). Firestore is the only fake.
 *
 * "I'm going to call my mom this weekend" → days later the builder offers ONE
 * follow-up → Ferni asks → the user's answer is recorded → it is never offered
 * again. A deflection drops it; a follow-up Ferni didn't actually ask records nothing.
 *
 * Before: the due-follow-up query needed a composite index that doesn't exist,
 * every offer rescheduled another one five days out, and answers were only
 * recorded when they happened to share two long words with the commitment.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedNestedFirestore as fs } from './helpers/nested-firestore.js';
import type { ContextBuilderInput } from '../intelligence/context-builders/core/types.js';

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

const { buildCommitmentFollowUpContext } =
  await import('../intelligence/context-builders/intelligence/commitment-follow-up.js');
const { trackFerniCommitments } =
  await import('../services/superhuman/semantic-intelligence/integration.js');
const { resetFollowThroughState } =
  await import('../services/trust-systems/commitment-follow-through.js');

const UID = 'sam';
const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-28T23:00:00Z');
let session = 0;

const commitments = () => fs.docsIn(`bogle_users/${UID}/commitments`);
const sources = (injections: Array<{ source: string }>) => injections.map((i) => i.source);

/** One user turn through the real builder, in call `call`, on turn `turn`. */
async function userSays(text: string, call: number, turn: number) {
  const input = {
    userText: text,
    analysis: { emotion: { primary: 'neutral' } },
    services: { userId: UID, sessionId: `call-${call}` },
    userData: { turnCount: turn },
  } as unknown as ContextBuilderInput;
  const injections = await buildCommitmentFollowUpContext(input);
  return { injections, text: injections.map((i) => i.content).join('\n') };
}

/** Ferni's reply, through the hook every spoken reply goes through. */
async function ferniSays(reply: string) {
  await trackFerniCommitments(UID, reply, {});
}

beforeEach(() => {
  fs.store.clear();
  resetFollowThroughState();
  session += 10;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});

describe("Ferni follows up once on what the user said they'd do", () => {
  it('asks once, records the answer, and never asks again', async () => {
    const said = await userSays("I'm going to call my mom this weekend", session, 3);
    expect(said.text).toContain('[USER COMMITMENT]');
    expect(commitments()).toHaveLength(1);
    expect(commitments()[0]).toMatchObject({
      content: 'call my mom this weekend',
      status: 'active',
    });

    // Five days later, in a new call: the one follow-up reaches the context.
    vi.setSystemTime(new Date(START.getTime() + 5 * DAY));
    const offer = await userSays('Work was busy today.', session + 1, 3);
    expect(offer.text).toContain('[FOLLOW-UP OPPORTUNITY]');
    expect(offer.text).toContain('call my mom this weekend');

    await ferniSays('You were going to call your mom this weekend. How did it go?');
    expect(commitments()[0]).toMatchObject({ awaitingAnswer: true, shouldFollowUp: false });

    const answer = await userSays('Yeah I called her, it went great', session + 1, 4);
    expect(answer.text).toContain('[THEY FOLLOWED THROUGH]');
    expect(commitments()[0]).toMatchObject({
      status: 'completed',
      followUpOutcome: 'done',
      followUpAnswer: 'Yeah I called her, it went great',
      awaitingAnswer: false,
    });

    // The rest of that call, and a call a week later: no second follow-up.
    const later = await userSays('Anyway, what should I cook tonight?', session + 1, 5);
    vi.setSystemTime(new Date(START.getTime() + 12 * DAY));
    const nextWeek = await userSays('Hey, me again.', session + 2, 3);
    expect(later.text + nextWeek.text).not.toContain('[FOLLOW-UP OPPORTUNITY]');
  });

  it('a deflection drops it for good', async () => {
    await userSays("I'm going to start running in the mornings", session, 3);
    vi.setSystemTime(new Date(START.getTime() + 5 * DAY));
    await userSays('Long day.', session + 1, 3);
    await ferniSays('You were going to start running in the mornings. How has that been?');

    const answer = await userSays("I'd rather not talk about it", session + 1, 4);
    expect(answer.text).toContain('[LET IT GO]');
    expect(commitments()[0]).toMatchObject({
      status: 'paused',
      followUpOutcome: 'deflected',
      followUpReception: 'avoidant',
    });

    vi.setSystemTime(new Date(START.getTime() + 20 * DAY));
    const later = await userSays('Hi again.', session + 2, 3);
    expect(later.text).not.toContain('[FOLLOW-UP OPPORTUNITY]');
  });

  it("an offer Ferni didn't take records nothing, so it can still be asked once later", async () => {
    await userSays("I'm going to call my mom this weekend", session, 3);
    vi.setSystemTime(new Date(START.getTime() + 5 * DAY));
    await userSays('Work was busy today.', session + 1, 3);
    await ferniSays('That sounds like a lot. Want to tell me about it?');

    expect(commitments()[0]).toMatchObject({ shouldFollowUp: true, followUpCount: 0 });
    expect(commitments()[0].awaitingAnswer).toBeUndefined();
    const reply = await userSays('Yeah, my boss was annoying', session + 1, 4);
    expect(sources(reply.injections)).not.toContain('commitment_answer');
    expect(commitments()[0].status).toBe('active');

    // Never asked, so the next call can still offer it, once.
    vi.setSystemTime(new Date(START.getTime() + 7 * DAY));
    const nextCall = await userSays('Morning!', session + 2, 3);
    expect(nextCall.text).toContain('[FOLLOW-UP OPPORTUNITY]');
    expect(nextCall.text).toContain('call my mom this weekend');
  });
});
