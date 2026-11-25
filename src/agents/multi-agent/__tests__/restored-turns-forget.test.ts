/**
 * Turns put back into a new call's history leave out a topic the caller asked
 * Ferni to forget (FORGET_EVERY_READER, #2762), in both readers of
 * resume-after-drop.ts: the reconnect after a drop (RESUME_AFTER_DROP) and the
 * phone call a "call me" moved to (CALL_ME_MOVES_TO_PHONE). The turns are the
 * caller's raw speech, so any distinctive word of a topic leaves a turn out
 * (the passage check). Flag off, the turns go back exactly as before. A forget
 * read that fails, throws or is late keeps no turn. On a moved call the forget
 * read starts beside the turns read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const store = vi.hoisted(() => ({
  conversations: [] as Array<{ id: string }>,
  turns: new Map<string, Turn[]>(),
}));
vi.mock('../../../services/memory/realtime-memory.js', () => ({
  getRecentConversations: vi.fn(async (_u: string, limit: number) =>
    store.conversations.slice(0, limit)
  ),
  getConversationTurns: vi.fn(async (_u: string, id: string) => store.turns.get(id) ?? []),
}));

const directedText = vi.fn(async (_s: string, cue: { fallback: string }) => ({
  text: cue.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

/** The stored forgotten topics (forget.ts), as the shared read gets them. */
const topics = vi.hoisted(() => ({
  read: vi.fn(async (_u: string): Promise<string[] | null> => []),
}));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: (userId: string) => topics.read(userId),
}));

const { greetingOrResume, startResumeLookup, MOVED_NOTE } = await import('../resume-after-drop.js');
const realtime = await import('../../../services/memory/realtime-memory.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');
const { setProactiveSessionContext, clearProactiveSessionContext } =
  await import('../../../intelligence/context-builders/external/proactive-session-context.js');

interface Msg {
  role: string;
  content: string;
}
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

/** Each topic as stored, and a line of the caller's that is about it without its exact words. */
const LEAKS: Array<[string, string]> = [
  ['the Denver job', 'I got the offer from the Denver office yesterday'],
  ['my divorce papers', 'the divorce is finally done'],
  ["my brother's number", 'his number is 435 555 0142'],
];
const TOPICS = LEAKS.map(([topic]) => topic);
const PUPPY = 'I adopted a puppy named Biscuit last week';
const PUPPY_REPLY = 'A puppy! What is Biscuit like?';
const KEPT = [PUPPY, PUPPY_REPLY];
const LINES: Array<[Turn['role'], string]> = [
  ['user', PUPPY],
  ['assistant', PUPPY_REPLY],
  ...LEAKS.map(([, line]): [Turn['role'], string] => ['user', line]),
  ['user', "please forget the Denver job, my divorce papers and my brother's number"],
];

function seedCall(conversationId: string, lines = LINES): void {
  const now = Date.now();
  store.turns.set(
    conversationId,
    lines.map(([role, content], i) => ({
      role,
      content,
      timestamp: new Date(now - 25_000 - (lines.length - 1 - i) * 4000),
    }))
  );
}

const said = (history: Msg[]) => history.filter((m) => m.role !== 'system').map((m) => m.content);

let n = 0;
const sessions: string[] = [];
function newSession(): string {
  const id = `session-forget-restore-${++n}`;
  sessions.push(id);
  return id;
}

/** A reconnect after a drop: the dropped call is the caller's newest un-ended one. */
async function resumeDropped(userId: string, lines = LINES) {
  store.conversations = [{ id: 'conv_new' }, { id: 'conv_dropped' }];
  store.turns.set('conv_new', []);
  seedCall('conv_dropped', lines);
  const sessionId = newSession();
  startResumeLookup(sessionId, userId, 'conv_new');
  const { agent, committed } = fakeAgent();
  const line = await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
  return { line, history: committed.at(-1) ?? [] };
}

/** A phone call a "call me" moved from that caller's app call. */
async function moveToPhone(userId: string, lines = LINES) {
  seedCall('conv_app', lines);
  const sessionId = newSession();
  setProactiveSessionContext(sessionId, {
    triggerType: 'silence',
    triggerReason: 'They asked you to call them.',
    openerStyle: 'warm',
    initiatingPersona: 'ferni',
    movedFrom: { userId, conversationId: 'conv_app' },
  });
  const { agent, committed } = fakeAgent();
  await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
  return { history: committed.at(-1) ?? [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetForgetTopicsSource();
  store.conversations = [];
  store.turns.clear();
  topics.read.mockImplementation(async () => TOPICS);
  vi.stubEnv('RESUME_AFTER_DROP', 'on');
  vi.stubEnv('CALL_ME_MOVES_TO_PHONE', 'on');
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  sessions.splice(0).forEach(clearProactiveSessionContext);
});

describe('restoreDroppedTurns: the reconnect after a drop', () => {
  it('flag on: the turns about the forgotten topic are gone, the rest go back', async () => {
    const { line, history } = await resumeDropped('user-forget-d1');

    expect(said(history)).toEqual(KEPT);
    expect(history.at(-1)?.content).toMatch(/^\[RESUMED CALL\]/);
    // The reconnect line quotes the last remembered caller line, not the forget request
    expect(line).toContain('adopted a puppy named Biscuit last week');
    expect(line).not.toMatch(/denver|divorce|number/i);
    expect(topics.read).toHaveBeenCalledWith('user-forget-d1');
  });

  it.each(LEAKS)('flag on: topic "%s" leaves out "%s"', async (topic, line) => {
    topics.read.mockImplementation(async () => [topic]);
    const { history } = await resumeDropped('user-forget-leak-d', [
      ...LINES.slice(0, 2),
      ['user', line],
    ]);

    expect(said(history)).toEqual(KEPT);
  });

  it('flag off: every turn goes back as before, and no forget read is made', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const { line, history } = await resumeDropped('user-forget-d2');

    expect(said(history)).toEqual(LINES.map(([, content]) => content));
    expect(line).toContain('forget the Denver job');
    expect(topics.read).not.toHaveBeenCalled();
  });

  it('the forget read fails: no turn goes back (fail closed), the drop is still owned', async () => {
    topics.read.mockImplementation(async () => null);
    const { line, history } = await resumeDropped('user-forget-d3');

    expect(said(history)).toEqual([]);
    expect(history.at(-1)?.content).toMatch(/^\[RESUMED CALL\]/);
    expect(line).toBe('Sorry, I dropped for a second. Where were we?');
  });

  it('the forget read throws: no turn goes back', async () => {
    topics.read.mockImplementation(async () => {
      throw new Error('firestore down');
    });
    const { history } = await resumeDropped('user-forget-d4');

    expect(said(history)).toEqual([]);
  });
});

describe('restoreMovedTurns: the phone call a "call me" moved to', () => {
  it('flag on: the turns about the forgotten topic are gone, the rest go back', async () => {
    const { history } = await moveToPhone('user-forget-m1');

    expect(said(history)).toEqual(KEPT);
    expect(history.at(-1)?.content).toBe(MOVED_NOTE);
  });

  it.each(LEAKS)('flag on: topic "%s" leaves out "%s"', async (topic, line) => {
    topics.read.mockImplementation(async () => [topic]);
    const { history } = await moveToPhone('user-forget-leak-m', [
      ...LINES.slice(0, 2),
      ['user', line],
    ]);

    expect(said(history)).toEqual(KEPT);
  });

  it('the forget read starts beside the turns read, not after it', async () => {
    let forgetReadsAtTurnsRead = -1;
    vi.mocked(realtime.getConversationTurns).mockImplementationOnce(async (_u, id) => {
      forgetReadsAtTurnsRead = topics.read.mock.calls.length;
      return store.turns.get(id) ?? [];
    });
    const { history } = await moveToPhone('user-forget-m4');

    expect(forgetReadsAtTurnsRead).toBe(1);
    expect(said(history)).toEqual(KEPT);
  });

  it('the forget read is late: no turn goes back (fail closed)', async () => {
    topics.read.mockImplementation(() => new Promise<string[] | null>(() => {}));
    const { history } = await moveToPhone('user-forget-m5');

    expect(said(history)).toEqual([]);
  });

  it('flag off: the last turns go back as before, and no forget read is made', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const { history } = await moveToPhone('user-forget-m2');

    expect(said(history)).toEqual(LINES.map(([, content]) => content));
    expect(topics.read).not.toHaveBeenCalled();
  });

  it('the forget read fails: no turn goes back (fail closed)', async () => {
    topics.read.mockImplementation(async () => null);
    const { history } = await moveToPhone('user-forget-m3');

    expect(said(history)).toEqual([]);
  });
});
