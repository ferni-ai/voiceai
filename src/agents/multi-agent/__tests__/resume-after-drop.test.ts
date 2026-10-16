/**
 * RESUME_AFTER_DROP: a re-dispatched job picks the dropped call back up
 * (its turns, and an honest reconnect line) instead of starting cold.
 * Prod 2026-10-13: the second pod greeted "Hey. What's up?" with no memory of
 * Ryan's introduction, then told Seth "Still here, no crash."
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Turn = { role: 'user' | 'assistant'; content: string; timestamp: Date };
type Conv = { id: string; endedAt?: Date };

const store = vi.hoisted(() => ({
  conversations: [] as Conv[],
  turns: new Map<string, Turn[]>(),
}));
const getRecentConversations = vi.fn(async (_userId: string, limit: number) =>
  store.conversations.slice(0, limit)
);
const getConversationTurns = vi.fn(
  async (_userId: string, conversationId: string) => store.turns.get(conversationId) ?? []
);
vi.mock('../../../services/memory/realtime-memory.js', () => ({
  getRecentConversations,
  getConversationTurns,
}));

const directedText = vi.fn(async (_sessionId: string, cue: { fallback: string }) => ({
  text: cue.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

const { greetingOrResume, reconnectFallback, startResumeLookup, RESTORED_TURNS } =
  await import('../resume-after-drop.js');

type Msg = { role: string; content: string };
function fakeAgent() {
  const committed: Msg[][] = [];
  const agent = {
    chatCtx: {
      copy: () => {
        const items: Msg[] = [];
        return { items, addMessage: (m: Msg) => items.push(m) };
      },
    },
    updateChatCtx: vi.fn(async (ctx: unknown) => {
      committed.push((ctx as { items: Msg[] }).items);
    }),
  };
  return { agent, committed };
}

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms);

/** The Ryan call: 10 turns in an un-ended conversation, last one 25 s ago. */
function seedDroppedCall(lastTurnAgoMs = 25_000, ended = false, extraTurns = 0): void {
  const turns: Turn[] = [];
  const total = 10 + extraTurns;
  for (let i = 0; i < total; i++) {
    turns.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i % 2 === 0 ? `user line ${i}` : `ferni line ${i}`,
      timestamp: ago(lastTurnAgoMs + (total - 1 - i) * 4000),
    });
  }
  turns[total - 2] = {
    ...turns[total - 2],
    content: 'Hey Ferni, this is my friend Ryan. He wanted to meet you…',
  };
  store.conversations = [
    { id: 'conv_new' },
    { id: 'conv_dropped', ...(ended ? { endedAt: ago(lastTurnAgoMs) } : {}) },
  ];
  store.turns.set('conv_new', []);
  store.turns.set('conv_dropped', turns);
}

let n = 0;
const nextSession = () => `session-AJ_test-${++n}`;
const moments = () =>
  directedText.mock.calls.map((c) => (c[1] as unknown as { moment: string }).moment);

beforeEach(() => {
  vi.clearAllMocks();
  store.conversations = [];
  store.turns.clear();
});
afterEach(() => {
  delete process.env.RESUME_AFTER_DROP;
});

describe('resume after a dropped call (RESUME_AFTER_DROP=on)', () => {
  beforeEach(() => {
    process.env.RESUME_AFTER_DROP = 'on';
  });

  it('restores the dropped turns and the drop note, then opens with an honest reconnect line', async () => {
    seedDroppedCall();
    const sessionId = nextSession();
    const { agent, committed } = fakeAgent();
    startResumeLookup(sessionId, 'user-1', 'conv_new');

    const line = await greetingOrResume(
      sessionId,
      { personaId: 'ferni', agent },
      { userName: 'Seth' }
    );

    expect(committed).toHaveLength(1);
    const history = committed[0];
    expect(history.slice(0, -1).map((m) => m.content)).toEqual(
      store.turns.get('conv_dropped')!.map((t) => t.content)
    );
    expect(history[0]).toEqual({ role: 'user', content: 'user line 0' });
    expect(history.at(-1)!.role).toBe('system');
    expect(history.at(-1)!.content).toMatch(/dropped about 25 seconds ago/);
    expect(history.at(-1)!.content).toMatch(/Never deny it/);

    expect(moments()).toEqual(['resume_after_drop']);
    const cue = directedText.mock.calls[0][1] as unknown as {
      mustInclude: string[];
      facts: Record<string, string>;
    };
    expect(cue.mustInclude).toEqual(['dropped']);
    expect(cue.facts['the last thing they said before the drop']).toMatch(/my friend Ryan/);
    expect(line).toMatch(/^Sorry, I dropped for a second\./);
    expect(line).toMatch(/my friend Ryan/);
    expect(line).not.toMatch(/[—–…]|\.\.\./);
  });

  it('puts back only the last turns of a long call', async () => {
    seedDroppedCall(25_000, false, 20);
    const sessionId = nextSession();
    const { agent, committed } = fakeAgent();
    startResumeLookup(sessionId, 'user-1', 'conv_new');
    await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);

    const restored = committed[0].slice(0, -1);
    expect(restored).toHaveLength(RESTORED_TURNS);
    expect(restored.at(-1)!.content).toBe('ferni line 29');
  });

  it('greets cold when the last conversation was ended', async () => {
    seedDroppedCall(25_000, true);
    const sessionId = nextSession();
    const { agent, committed } = fakeAgent();
    startResumeLookup(sessionId, 'user-1', 'conv_new');
    await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);

    expect(committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });

  it('greets cold when the last turn is older than two minutes', async () => {
    seedDroppedCall(3 * 60_000);
    const sessionId = nextSession();
    const { agent, committed } = fakeAgent();
    startResumeLookup(sessionId, 'user-1', 'conv_new');
    await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);

    expect(committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });

  it('never treats this call as the dropped one', async () => {
    store.conversations = [{ id: 'conv_new' }];
    store.turns.set('conv_new', [{ role: 'user', content: 'hi', timestamp: ago(1000) }]);
    const sessionId = nextSession();
    const { agent, committed } = fakeAgent();
    startResumeLookup(sessionId, 'user-1', 'conv_new');
    await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);

    expect(committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });
});

describe('RESUME_AFTER_DROP off (default)', () => {
  it('does not look anything up and greets cold, even after a fresh drop', async () => {
    seedDroppedCall();
    const sessionId = nextSession();
    const { agent, committed } = fakeAgent();
    startResumeLookup(sessionId, 'user-1', 'conv_new');
    await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);

    expect(getRecentConversations).not.toHaveBeenCalled();
    expect(committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });
});

describe('the understudy reconnect line', () => {
  const call = (turns: Turn[]) => ({ conversationId: 'c', turns, secondsAgo: 20 });

  it('quotes the end of their last words, with no em dashes or ellipses', () => {
    const line = reconnectFallback(
      call([
        {
          role: 'user',
          content: 'So the thing is — I start the new job Monday…',
          timestamp: ago(0),
        },
        { role: 'assistant', content: 'That is big.', timestamp: ago(0) },
      ])
    );
    expect(line).toBe(
      'Sorry, I dropped for a second. The last thing I caught was "So the thing is, I start the new job Monday".'
    );
  });

  it('asks where they were when nothing they said survived', () => {
    expect(reconnectFallback(call([]))).toBe('Sorry, I dropped for a second. Where were we?');
  });
});
