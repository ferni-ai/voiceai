/**
 * CALL_ME_MOVES_TO_PHONE, the phone call's side: the signed dispatch names the
 * app call's conversation (ids only, never its text: LiveKit stores dispatch
 * metadata). Its last turns are read from that user's own memory store, while
 * fresh, and go into the phone agent's history with a note that the call
 * moved, so it carries on instead of starting cold. The app call it moved from
 * is still open at pickup, which RESUME_AFTER_DROP would read as a drop: it
 * must not open with "sorry, I dropped". Nothing of the dispatch but
 * allowlisted keys reaches the startup log.
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

const { greetingOrResume, startResumeLookup, MOVED_NOTE, MOVED_TURNS, MOVED_WINDOW_MS } =
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
const { setProactiveSessionContext, clearProactiveSessionContext, getProactiveSessionContext } =
  await import('../../../intelligence/context-builders/external/proactive-session-context.js');
const { movedFromOf, parseJobMetadata, setupCallTypeContexts } =
  await import('../../voice-agent-entry/metadata-parser.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');

const moments = () =>
  directedText.mock.calls.map((c) => (c[1] as unknown as { moment: string }).moment);

const APP_CALL: { userId: string; conversationId?: string } = {
  userId: 'user-1',
  conversationId: 'conv_dropped',
};

function phoneCall(sessionId: string, movedFrom?: typeof APP_CALL): void {
  setProactiveSessionContext(sessionId, {
    triggerType: 'silence',
    triggerReason: 'They asked you to call them.',
    openerStyle: 'warm',
    initiatingPersona: 'ferni',
    ...(movedFrom && { movedFrom }),
  });
}

const sessions: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  store.conversations = [];
  store.turns.clear();
  process.env.RESUME_AFTER_DROP = 'on';
  process.env.CALL_ME_MOVES_TO_PHONE = 'on';
});
afterEach(() => {
  delete process.env.RESUME_AFTER_DROP;
  delete process.env.CALL_ME_MOVES_TO_PHONE;
  sessions.splice(0).forEach(clearProactiveSessionContext);
});

function movedPhoneCall(movedFrom?: typeof APP_CALL) {
  const sessionId = nextSession();
  sessions.push(sessionId);
  phoneCall(sessionId, movedFrom);
  startResumeLookup(sessionId, 'user-1', 'conv_new');
  return sessionId;
}

describe('a phone call a "call me" moved from the app', () => {
  it('reads the app call\'s last turns from that user\'s store into history, with the moved note and no "dropped" opener', async () => {
    seedDroppedCall(5_000); // the app call: not ended yet, last turn moments ago
    const sessionId = movedPhoneCall(APP_CALL);
    const { agent, committed } = fakeAgent();

    const line = await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);

    expect(getConversationTurns).toHaveBeenCalledWith('user-1', 'conv_dropped', expect.any(Number));
    const appTurns = store.turns.get('conv_dropped')!.slice(-MOVED_TURNS);
    expect(committed).toHaveLength(1);
    expect(committed[0].slice(0, -1)).toEqual(
      appTurns.map((t) => ({ role: t.role, content: t.content }))
    );
    expect(committed[0].at(-1)).toEqual({ role: 'system', content: MOVED_NOTE });
    expect(moments()).not.toContain('resume_after_drop');
    expect(line).not.toMatch(/dropped/i);
  });

  it('a moved call with no reference (memory held) reads nothing, and still is no drop', async () => {
    seedDroppedCall(5_000);
    const sessionId = movedPhoneCall({ userId: 'user-1' });
    const { agent, committed } = fakeAgent();
    const line = await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
    expect(committed).toEqual([]);
    expect(moments()).not.toContain('resume_after_drop');
    expect(line).not.toMatch(/dropped/i);
  });

  it('a stale reference reads nothing back (it is short-lived), and still is no drop', async () => {
    seedDroppedCall(MOVED_WINDOW_MS + 60_000);
    const sessionId = movedPhoneCall(APP_CALL);
    const { agent, committed } = fakeAgent();
    const line = await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
    expect(committed).toEqual([]);
    expect(line).not.toMatch(/dropped/i);
  });

  it('a failed read of the app call is still a moved call: no "dropped" opener', async () => {
    seedDroppedCall(5_000); // the app call is still open, so a drop lookup would find it
    const sessionId = movedPhoneCall(APP_CALL);
    await vi.waitFor(() => expect(getConversationTurns).toHaveBeenCalledTimes(1)); // drop lookup
    getConversationTurns.mockRejectedValueOnce(new Error('firestore unavailable'));
    const { agent, committed } = fakeAgent();

    const line = await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);

    expect(getConversationTurns).toHaveBeenCalledTimes(2);
    expect(committed).toEqual([]);
    expect(moments()).not.toContain('resume_after_drop');
    expect(line).not.toMatch(/dropped/i);
  });

  it('flag off: a moved context reads nothing and restores nothing', async () => {
    delete process.env.CALL_ME_MOVES_TO_PHONE;
    const sessionId = movedPhoneCall({ userId: 'user-1', conversationId: 'conv_app' });
    store.turns.set('conv_app', [{ role: 'user', content: 'hi', timestamp: ago(1_000) }]);
    const { agent, committed } = fakeAgent();
    await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
    expect(getConversationTurns).not.toHaveBeenCalled();
    expect(committed).toEqual([]);
  });

  it('a proactive call that was not moved is unchanged: nothing read, nothing restored', async () => {
    const sessionId = nextSession();
    sessions.push(sessionId);
    phoneCall(sessionId);
    const { agent, committed } = fakeAgent();
    await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
    expect(committed).toEqual([]);
    expect(getConversationTurns).not.toHaveBeenCalled();
  });
});

describe('the dispatch reference (metadata-parser movedFromOf)', () => {
  const raw = (o: object) => JSON.stringify(o);
  it('takes the signed user and a plain conversation id, nothing else', () => {
    const move = { callMove: true, userId: 'u1' };
    expect(movedFromOf(raw({ ...move, movedFrom: 'conv_176_abc' }))).toEqual({
      userId: 'u1',
      conversationId: 'conv_176_abc',
    });
    // A bad id is no reference, but still a moved call (screened, never read as a drop)
    for (const movedFrom of ['../u2/conversations/x', 'a/b', '', 'x'.repeat(200), 42]) {
      expect(movedFromOf(raw({ ...move, movedFrom }))).toEqual({ userId: 'u1' });
    }
    expect(movedFromOf(raw({ ...move }))).toEqual({ userId: 'u1' }); // memory held: no id
    expect(movedFromOf(raw({ userId: 'u1', movedFrom: 'conv_176_abc' }))).toBeUndefined();
    expect(movedFromOf(raw({ callMove: true, movedFrom: 'conv_176_abc' }))).toBeUndefined();
    expect(movedFromOf('{not json')).toBeUndefined();
    expect(movedFromOf(undefined)).toBeUndefined();
  });

  it('flag off: no reference is read at all', () => {
    delete process.env.CALL_ME_MOVES_TO_PHONE;
    const signed = { callMove: true, userId: 'u1', movedFrom: 'conv_176_abc' };
    expect(movedFromOf(raw(signed))).toBeUndefined();
  });
});

describe('the startup log of a dispatch', () => {
  it('writes keys and allowlisted ids only: no reference, reason or other free text', () => {
    const SECRET_REASON = 'They asked you to call. Your words: "about my divorce papers"';
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      const job = {
        type: 'proactive_outreach',
        userId: 'user-1',
        persona_id: 'ferni',
        triggerReason: SECRET_REASON,
        movedFrom: 'conv_1761234567890_abc123',
        recentTurns: [{ role: 'user', content: 'my sister is moving to Denver' }],
      };
      parseJobMetadata({
        job: { metadata: JSON.stringify(job), room: { metadata: JSON.stringify(job) } },
      } as never);
      parseJobMetadata({ job: { metadata: `{"broken": "${SECRET_REASON}` } } as never);
    } finally {
      spy.mockRestore();
    }
    const logged = writes.join('');
    expect(logged).toContain(
      'Raw job.metadata = {"type":"proactive_outreach","persona_id":"ferni"}'
    );
    for (const secret of ['divorce', 'Denver', 'conv_1761234567890_abc123']) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe('the reference comes only from the signed job metadata', () => {
  const SECRET = 'lk-test-secret';
  const job = {
    type: 'proactive_outreach',
    callId: 'c1',
    userId: 'user-1',
    persona_id: 'ferni',
    triggerType: 'promise',
    triggerReason: 'They asked you to call them.',
  };
  let prior: string | undefined;
  beforeEach(() => {
    prior = process.env.LIVEKIT_API_SECRET;
    process.env.LIVEKIT_API_SECRET = SECRET;
  });
  afterEach(() => {
    if (prior === undefined) delete process.env.LIVEKIT_API_SECRET;
    else process.env.LIVEKIT_API_SECRET = prior;
  });

  it('signed movedFrom: the phone call is pointed at that conversation', async () => {
    const sessionId = nextSession();
    sessions.push(sessionId);
    const raw = JSON.stringify(
      signDispatch({ ...job, callMove: true, movedFrom: 'conv_app' }, SECRET)
    );
    await setupCallTypeContexts(JSON.parse(raw), 'proactive_outreach', sessionId, undefined, raw);
    expect(getProactiveSessionContext(sessionId)?.movedFrom).toEqual({
      userId: 'user-1',
      conversationId: 'conv_app',
    });
  });

  it('room metadata carrying userId and movedFrom is ignored: it is not signed', async () => {
    const sessionId = nextSession();
    sessions.push(sessionId);
    const raw = JSON.stringify(signDispatch(job, SECRET)); // signed, no movedFrom
    // parseJobMetadata merges room metadata over the job's: what setupCallTypeContexts gets
    const merged = {
      ...JSON.parse(raw),
      callMove: true,
      userId: 'someone-else',
      movedFrom: 'conv_theirs',
    };
    await setupCallTypeContexts(merged, 'proactive_outreach', sessionId, undefined, raw);
    expect(getProactiveSessionContext(sessionId)).toBeDefined(); // the signed call itself is set up
    expect(getProactiveSessionContext(sessionId)?.movedFrom).toBeUndefined();
  });
});
