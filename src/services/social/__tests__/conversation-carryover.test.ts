/**
 * Conversation carryover: what one call leaves for the next (flag, mood, the
 * staleness rule, per-user storage, bounded saves).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** An in-memory Firestore that keeps what is set, by full document path. */
const docs = new Map<string, unknown>();
const writes: string[] = [];
const fakeDb = {
  collection: (c: string) => ({
    doc: (u: string) => ({
      collection: (s: string) => ({
        doc: (d: string) => {
          const path = `${c}/${u}/${s}/${d}`;
          return {
            set: vi.fn(async (data: unknown) => {
              writes.push(path);
              docs.set(path, data);
            }),
            get: vi.fn(async () => ({ exists: docs.has(path), data: () => docs.get(path) })),
          };
        },
      }),
    }),
  }),
};
const getDb = vi.fn(() => fakeDb);
vi.mock('../../../utils/safe-firestore.js', () => ({ getDb: () => getDb() }));

const {
  CARRYOVER_SAVE_EVERY_MS,
  endConversationState,
  freshCarryover,
  noteCarryoverMood,
  openConversation,
  restoredCarryover,
  setCarryoverDb,
  snapshotOf,
} = await import('../conversation-carryover.js');
// As session-init-handler.ts hands it in.
setCarryoverDb(() => getDb() as unknown as FirebaseFirestore.Firestore);
const { getConversationState } = await import('../conversation-state.js');

const ON = { CONVERSATION_CARRYOVER: 'on' };
const DAY = 86_400_000;
const pathOf = (uid: string) => `bogle_users/${uid}/conversation_state/carryover`;
let n = 0;
const ids = () => {
  n += 1;
  return { sessionId: `s-${n}-${Date.now()}`, userId: `u-${n}` };
};
/** Let the background restore read settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  docs.clear();
  writes.length = 0;
  getDb.mockClear();
  delete process.env.CONVERSATION_CARRYOVER;
});
afterEach(() => {
  delete process.env.CONVERSATION_CARRYOVER;
  vi.useRealTimers();
});

describe('noteCarryoverMood', () => {
  it('leaves the state alone with the flag off', () => {
    const state = getConversationState(ids().sessionId, 'u');
    noteCarryoverMood(state, { primary: 'sadness', intensity: 0.8 }, {});
    expect(state.getEmotionalContext()).toMatchObject({ sentiment: 'neutral', emotions: [] });
  });

  it("maps the emotion detector's labels into the state with the flag on", () => {
    const state = getConversationState(ids().sessionId, 'u');
    noteCarryoverMood(state, { primary: 'sadness', intensity: 0.8 }, ON);
    expect(state.getEmotionalContext()).toMatchObject({ sentiment: 'negative', emotions: ['sad'] });
    noteCarryoverMood(state, { primary: 'joy', intensity: 0.6 }, ON);
    expect(state.getEmotionalContext()).toMatchObject({
      sentiment: 'positive',
      emotions: ['sad', 'happy'],
    });
  });

  it('reads distress as negative whatever the label, and skips labels it has no word for', () => {
    const state = getConversationState(ids().sessionId, 'u');
    noteCarryoverMood(state, { primary: 'surprise', intensity: 0.9 }, ON);
    expect(state.getEmotionalContext().emotions).toEqual([]);
    noteCarryoverMood(state, { primary: 'joy', intensity: 0.5, distressLevel: 0.8 }, ON);
    expect(state.getEmotionalContext().sentiment).toBe('negative');
  });
});

describe('snapshotOf', () => {
  it('is null for a call with no mood and no topics, so it never wipes a richer last call', () => {
    expect(snapshotOf(getConversationState(ids().sessionId, 'u'))).toBeNull();
  });

  it('keeps the mood and the last five distinct topics, and no words the caller said', () => {
    const state = getConversationState(ids().sessionId, 'u');
    for (const t of ['a', 'b', 'a', 'c', 'd', 'e', 'f']) state.setCurrentTopic(t);
    state.addKeyMoment('User said: something private');
    noteCarryoverMood(state, { primary: 'fear', intensity: 0.7 }, ON);
    const snap = snapshotOf(state, new Date('2026-10-12T10:00:00Z'));
    expect(snap).toMatchObject({
      sentiment: 'negative',
      emotions: ['anxious'],
      topics: ['b', 'c', 'd', 'e', 'f'],
      savedAt: '2026-10-12T10:00:00.000Z',
    });
    expect(Object.keys(snap ?? {}).sort()).toEqual(
      ['circleBack', 'emotions', 'savedAt', 'sentiment', 'sessionId', 'topics', 'v'].sort()
    );
  });
});

describe('freshCarryover (staleness)', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const snap = (ageMs: number) => ({
    v: 1 as const,
    sessionId: 's',
    savedAt: new Date(now.getTime() - ageMs).toISOString(),
    sentiment: 'negative' as const,
    emotions: ['sad' as const],
    topics: ['work'],
    circleBack: [],
  });

  it('brings back the mood and topics of a call yesterday', () => {
    expect(freshCarryover(snap(DAY + 1), now)).toEqual({
      ageDays: 1,
      mood: { sentiment: 'negative', emotions: ['sad'] },
      topics: ['work'],
      circleBack: [],
    });
  });

  it('drops the mood after three days but keeps the topics', () => {
    const fresh = freshCarryover(snap(4 * DAY), now);
    expect(fresh?.mood).toBeUndefined();
    expect(fresh?.topics).toEqual(['work']);
  });

  it('brings back nothing older than two weeks, or dated in the future', () => {
    expect(freshCarryover(snap(15 * DAY), now)).toBeNull();
    expect(freshCarryover(snap(-DAY), now)).toBeNull();
  });
});

describe('openConversation / endConversationState', () => {
  it('with the flag off: the plain state, no Firestore read or write, nothing restored', async () => {
    const { sessionId, userId } = ids();
    docs.set(pathOf(userId), freshDoc());
    const state = openConversation(sessionId, userId, 'ferni', {});
    expect(state).toBe(getConversationState(sessionId));
    state.setCurrentTopic('work');
    await settle();
    expect(restoredCarryover(sessionId)).toBeNull();
    await endConversationState(sessionId);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("restores the user's own last call, never another user's", async () => {
    const a = ids();
    const b = ids();
    docs.set(pathOf(a.userId), freshDoc());
    openConversation(a.sessionId, a.userId, 'ferni', ON);
    openConversation(b.sessionId, b.userId, 'ferni', ON);
    await settle();
    expect(restoredCarryover(a.sessionId)).toMatchObject({ topics: ['the move'] });
    expect(restoredCarryover(b.sessionId)).toBeNull();
    await endConversationState(a.sessionId);
    await endConversationState(b.sessionId);
  });

  it("saves the call at its end under that user's record, and skips an empty call", async () => {
    const { sessionId, userId } = ids();
    const state = openConversation(sessionId, userId, 'ferni', ON);
    state.setCurrentTopic('work');
    await endConversationState(sessionId);
    expect(docs.get(pathOf(userId))).toMatchObject({ v: 1, sessionId, topics: ['work'] });

    const empty = ids();
    docs.set(pathOf(empty.userId), freshDoc());
    openConversation(empty.sessionId, empty.userId, 'ferni', ON);
    await endConversationState(empty.sessionId);
    expect(docs.get(pathOf(empty.userId))).toMatchObject({ topics: ['the move'] });
  });

  it('saves a long call every few minutes only when it changed, then once more at the end', async () => {
    vi.useFakeTimers();
    const { sessionId, userId } = ids();
    const state = openConversation(sessionId, userId, 'ferni', ON);
    state.setCurrentTopic('work');
    await vi.advanceTimersByTimeAsync(CARRYOVER_SAVE_EVERY_MS);
    expect(writes).toEqual([pathOf(userId)]);
    await vi.advanceTimersByTimeAsync(3 * CARRYOVER_SAVE_EVERY_MS); // nothing new: no writes
    expect(writes).toHaveLength(1);
    state.setCurrentTopic('sleep');
    await endConversationState(sessionId);
    expect(writes).toHaveLength(2);
    expect(docs.get(pathOf(userId))).toMatchObject({ topics: ['work', 'sleep'] });
    await vi.advanceTimersByTimeAsync(2 * CARRYOVER_SAVE_EVERY_MS); // the timer stopped
    expect(writes).toHaveLength(2);
  });

  it('never reads or writes for an anonymous or default caller', async () => {
    for (const userId of ['anonymous', 'default']) {
      const { sessionId } = ids();
      openConversation(sessionId, userId, 'ferni', ON).setCurrentTopic('work');
      await endConversationState(sessionId);
    }
    expect(getDb).not.toHaveBeenCalled();
  });
});

function freshDoc() {
  return {
    v: 1,
    sessionId: 'earlier',
    savedAt: new Date(Date.now() - DAY).toISOString(),
    sentiment: 'negative',
    emotions: ['anxious'],
    topics: ['the move'],
    circleBack: [],
  };
}
