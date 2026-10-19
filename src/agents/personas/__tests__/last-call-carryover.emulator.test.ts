/**
 * CONVERSATION_CARRYOVER, call → next call, on the Firestore emulator: the
 * session state the live turn writes (SessionStateManager.setEmotionAnalysis
 * and setTopic, as turn-handler.ts calls them) is saved when the call ends,
 * read back when the same user's next call opens, and reaches the per-turn
 * reminder the reply is built from (withTurnReminder). Real writer, real
 * reader, real Firestore client (safe-firestore getDb).
 */
import type { Firestore } from 'firebase-admin/firestore';
import { llm } from '@livekit/agents';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin for every test; this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.unmock('firebase-admin/firestore');

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-conversation-carryover';

let db: Firestore;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;
const before = process.env.CONVERSATION_CARRYOVER;

beforeAll(async () => {
  if (!emulator) return;
  process.env.CONVERSATION_CARRYOVER = 'on';
  const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
});

afterAll(() => {
  if (before === undefined) delete process.env.CONVERSATION_CARRYOVER;
  else process.env.CONVERSATION_CARRYOVER = before;
});

async function waitFor<T>(read: () => T | null, ms = 5_000): Promise<T | null> {
  const end = Date.now() + ms;
  for (let v = read(); Date.now() < end; v = read()) {
    if (v) return v;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return read();
}

const reminderOf = (c: llm.ChatContext): string => {
  const last = c.items.at(-1);
  return last?.type === 'message' ? (last.textContent ?? '') : '';
};

describe.skipIf(!emulator)('conversation carryover, call to next call (Firestore emulator)', () => {
  it("restores how the last call went and puts it in the next call's turn reminder", async () => {
    const carry = await import('../../../services/social/conversation-carryover.js');
    const { createSessionStateManager } = await import('../../session/session-state.js');
    const { withTurnReminder } = await import('../turn-request.js');
    const uid = newUser();

    // Call 1: what the live turn writes (turn-handler.ts), then the call ends (cleanup-handler.ts).
    const s1 = `session-1-${uid}`;
    const conversationState = carry.openConversation(s1, uid, 'ferni');
    const manager = createSessionStateManager(s1, 'ferni', { userId: uid, conversationState });
    manager.setEmotionAnalysis({ primary: 'sadness', intensity: 0.8, distressLevel: 0.3 });
    manager.setTopic('the move');
    await carry.endConversationState(s1);

    const stored = await db.doc(`bogle_users/${uid}/conversation_state/carryover`).get();
    expect(stored.data()).toMatchObject({
      sessionId: s1,
      sentiment: 'negative',
      emotions: ['sad'],
      topics: ['the move'],
    });

    // Call 2: the same user opens a new session.
    const s2 = `session-2-${uid}`;
    carry.openConversation(s2, uid, 'ferni');
    const restored = await waitFor(() => carry.restoredCarryover(s2));
    expect(restored).toEqual({
      ageDays: 0,
      mood: { sentiment: 'negative', emotions: ['sad'] },
      topics: ['the move'],
      circleBack: [],
    });

    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'assistant', content: 'Hey you.' });
    chat.addMessage({ role: 'user', content: 'Hi, long day.' });
    const session = { userData: { services: { sessionId: s2 } } };
    expect(reminderOf(withTurnReminder(chat, session))).toContain(
      'On your last call with them (earlier today), they seemed low and you talked about the move.'
    );
    await carry.endConversationState(s2);
  });

  it("is per user: another user's call never sees it, and account erasure removes it", async () => {
    const carry = await import('../../../services/social/conversation-carryover.js');
    const { eraseUserRecord } = await import('../../../services/platform/erase-user-record.js');
    const uid = newUser();
    const s1 = `session-a-${uid}`;
    carry.openConversation(s1, uid, 'ferni').setCurrentTopic('work');
    await carry.endConversationState(s1);
    expect(await carry.loadCarryover(uid)).toMatchObject({ topics: ['work'] });

    expect(await carry.loadCarryover(newUser())).toBeNull();

    await eraseUserRecord(uid, db);
    expect(await carry.loadCarryover(uid)).toBeNull();
  });
});
