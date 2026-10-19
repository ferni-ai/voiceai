/**
 * CONVERSATION_CARRYOVER: the last call's mood and topics, restored at session
 * start, reach the per-turn reminder the reply is built from.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, unknown>();
const ref = (path: string) => ({
  set: async (data: unknown) => void docs.set(path, data),
  get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
});
const fakeDb = {
  collection: (c: string) => ({
    doc: (u: string) => ({
      collection: (s: string) => ({ doc: (d: string) => ref(`${c}/${u}/${s}/${d}`) }),
    }),
  }),
};
vi.mock('../../../utils/safe-firestore.js', () => ({ getDb: () => fakeDb }));

const { LAST_CALL_REPLIES, lastCallNote, lastCallText } = await import('../last-call-note.js');
const { endConversationState, openConversation, setCarryoverDb } =
  await import('../../../services/social/conversation-carryover.js');
setCarryoverDb(() => fakeDb as unknown as FirebaseFirestore.Firestore);
const { withTurnReminder } = await import('../turn-request.js');

const ON = { CONVERSATION_CARRYOVER: 'on' };
const settle = () => new Promise((resolve) => setImmediate(resolve));

function chat(...lines: Array<['agent' | 'user', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [who, text] of lines)
    ctx.addMessage({ role: who === 'agent' ? 'assistant' : 'user', content: text });
  return ctx;
}

/** A session whose last call (yesterday) was low and about the move and their sister. */
async function restoredSession(userId: string) {
  docs.set(`bogle_users/${userId}/conversation_state/carryover`, {
    v: 1,
    sessionId: 'yesterday',
    savedAt: new Date(Date.now() - 86_400_000 - 60_000).toISOString(),
    sentiment: 'negative',
    emotions: ['sad'],
    topics: ['the move', 'their sister'],
    circleBack: [],
  });
  const sessionId = `s-${userId}-${Date.now()}`;
  openConversation(sessionId, userId, 'ferni', ON);
  await settle();
  return { sessionId, session: { userData: { services: { sessionId } } } };
}

afterEach(() => {
  delete process.env.CONVERSATION_CARRYOVER;
  docs.clear();
});

describe('lastCallText', () => {
  it('says how they seemed, when, and what you talked about', () => {
    expect(
      lastCallText({
        ageDays: 1,
        mood: { sentiment: 'negative', emotions: ['sad'] },
        topics: ['work', 'sleep'],
        circleBack: ['the interview'],
      })
    ).toMatch(
      /^On your last call with them \(yesterday\), they seemed low, you talked about work and sleep and you meant to come back to the interview\. /
    );
  });

  it('leaves the mood out when it has faded, and says nothing with nothing to say', () => {
    const text = lastCallText({ ageDays: 5, topics: ['work'], circleBack: [] });
    expect(text).toContain('(a few days ago), you talked about work.');
    expect(text).not.toContain('seemed');
    expect(lastCallText({ ageDays: 0, topics: [], circleBack: [] })).toBe('');
  });

  it('follows the voice text rules: no em dashes, ellipses or stage directions', () => {
    const text = lastCallText({
      ageDays: 0,
      mood: { sentiment: 'positive', emotions: ['happy'] },
      topics: ['a'],
      circleBack: ['b'],
    });
    expect(text).not.toMatch(/—|…|\.\.\.|\*|\[/);
  });
});

describe('lastCallNote', () => {
  it('is empty with the flag off, with crisis guidance, and after the first few replies', async () => {
    const { session } = await restoredSession('u-note');
    const early = chat(['agent', 'Hey you.'], ['user', 'Hi.']);
    expect(lastCallNote(early, session, false, ON)).toContain('they seemed low');
    expect(lastCallNote(early, session, false, {})).toBe('');
    expect(lastCallNote(early, session, true, ON)).toBe('');
    const lines: Array<['agent' | 'user', string]> = [];
    for (let i = 0; i < LAST_CALL_REPLIES; i++) lines.push(['agent', `line ${i}`], ['user', 'ok']);
    expect(lastCallNote(chat(...lines), session, false, ON)).toBe('');
  });

  it('is empty for a session that restored nothing', () => {
    const session = { userData: { services: { sessionId: 'never-opened' } } };
    expect(lastCallNote(chat(['user', 'Hi.']), session, false, ON)).toBe('');
  });
});

describe('withTurnReminder with a restored last call', () => {
  it('carries the last-call note into the request only when CONVERSATION_CARRYOVER is on', async () => {
    process.env.CONVERSATION_CARRYOVER = 'on';
    const { sessionId, session } = await restoredSession('u-reminder');
    const ctx = chat(['agent', 'Hey you.'], ['user', 'Hi, long day.']);
    const text = (c: llm.ChatContext) => {
      const last = c.items.at(-1);
      return last?.type === 'message' ? (last.textContent ?? '') : '';
    };
    expect(text(withTurnReminder(ctx, session))).toContain(
      'On your last call with them (yesterday), they seemed low and you talked about the move and their sister.'
    );
    delete process.env.CONVERSATION_CARRYOVER;
    expect(text(withTurnReminder(ctx, session))).not.toContain('On your last call');
    await endConversationState(sessionId);
  });
});
