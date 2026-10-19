/**
 * What Ferni kept from a call it made for the owner (call-memory.ts) comes
 * back in the owner's calls through the real readers, over a faked Firestore:
 * - per-turn recall (firestoreRecallStore -> loadRecallSnapshot -> recallForTurn)
 *   brings it up when the owner names that person;
 * - "forget what my mom said" (forgetTopic, the forget tool's path) takes it out;
 * - past its 180 days it is left out before TTL deletes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeUserDb, type Doc } from './fake-user-db.js';

let docs: Doc[] = [];
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fakeUserDb(docs),
}));
// The indexes forget cleans.
vi.mock('../../../memory/retrieval/conversation-index.js', () => ({
  removeConversationDocument: vi.fn(async () => undefined),
}));
vi.mock('../../../memory/retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: vi.fn(async () => undefined),
}));

const { rememberCall, CALL_MEMORY_TTL_MS } = await import('../call-memory.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { firestoreRecallStore } =
  await import('../../../agents/multi-agent/recall-firestore-store.js');
const { loadRecallSnapshot, recallForTurn } =
  await import('../../../memory/recall/session-recall.js');
const { forgetTopic } = await import('../../../memory/recall/forget.js');

const SUNDAY_11AM_NY = new Date('2026-10-18T15:02:00Z');

async function momCall(owner: string, at = SUNDAY_11AM_NY): Promise<void> {
  const call = buildOnBehalfDispatch({
    callId: `c-${owner}-${at.getTime()}`,
    requester: { userId: owner, name: 'Sam', timezone: 'America/New_York', originalSessionId: 's' },
    contact: { name: 'Mom', phone: '+12135550100' },
    purpose: 'check in',
    objective: 'check_in',
    callType: 'personal',
    ownerMemory: true,
  });
  const heard = ['I go to church every Sunday morning, honey.', 'Tell him I love him. Bye now!'];
  await rememberCall({
    call,
    outcome: {
      callId: call.callId,
      status: 'completed',
      objectiveAchieved: true,
      outcome: 'ok',
    },
    analysis: {
      transcript: {
        callId: call.callId,
        contactName: 'Mom',
        turns: [],
        duration: 66,
        capturedAt: '',
      },
      friendlyReport: 'Mom was off to church.',
      insights: {
        summary: 'Mom was off to church.',
        detailedSummary: '',
        keyPoints: ['She goes to church Sunday mornings'],
        emotionalTone: { recipientMood: 'warm', overallSentiment: 'positive', notableEmotions: [] },
        actionItems: [],
        messagesForUser: ['I love him'],
        callbackRequested: false,
        relationshipSignals: [],
        topicsMentioned: [],
        objectiveAchieved: true,
        callQuality: 'good',
      },
    },
    heard,
    answered: true,
    now: at,
  });
}

/** What recall brings to the owner's turn. */
async function recalled(owner: string, said: string): Promise<string[]> {
  const snapshot = await loadRecallSnapshot(firestoreRecallStore, owner);
  return recallForTurn(snapshot, said, new Set(), 4, 4).map((f) => f.value);
}

beforeEach(() => {
  docs = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SUNDAY_11AM_NY);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the owner's calls bring it up", () => {
  it('when the owner mentions mom, recall surfaces what she said, as hers', async () => {
    expect(await recalled('o-recall', 'can you call my mom again?')).toEqual([]);
    await momCall('o-recall');
    expect(await recalled('o-recall', 'can you call my mom again?')).toEqual(
      expect.arrayContaining([
        'Mom said: she goes to church Sunday mornings',
        'Mom asked to pass on: "I love him"',
      ])
    );
  });

  it('past 180 days it is left out', async () => {
    await momCall('o-old');
    vi.setSystemTime(new Date(SUNDAY_11AM_NY.getTime() + CALL_MEMORY_TTL_MS + 1));
    expect(await recalled('o-old', 'call my mom')).toEqual([]);
  });
});

describe('forgetting', () => {
  for (const ask of ['what my mom said']) {
    it(`"forget ${ask}" takes it out of recall`, async () => {
      await momCall('o-forget');
      expect(await forgetTopic('o-forget', ask)).toMatchObject({ kind: 'forgotten' });
      expect(await recalled('o-forget', 'can you call my mom again?')).toEqual([]);
    });
  }
});
