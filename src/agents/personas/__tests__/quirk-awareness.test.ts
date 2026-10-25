/**
 * QUIRK_AWARENESS: a snore, whistle or laugh that plays on the clip track
 * reaches the next reply request as one line, through the real paths: the
 * presence watcher in clip-player.ts plays it, withTurnReminder carries it.
 * A quirk that landed becomes one ledger line after the call.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mixer = vi.hoisted(() => ({ plays: 0 }));
vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      mixer.plays++;
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});

const { startBackchannelClips } = await import('../../integrations/clip-player.js');
const { withTurnReminder } = await import('../turn-request.js');
const { quirkEvents, recordQuirk, takeQuirks } =
  await import('../../../services/session/quirk-log.js');
const { ASK_WINDOW_MS } = await import('../quirk-note.js');
const { rememberQuirks } = await import('../../integrations/quirk-memory-register.js');
const { drainAfterCallTasks, runAfterCallTasks } =
  await import('../../../services/session/after-call-tasks.js');

const pcm = () => new Int16Array(2400).fill(8000).buffer;
let sid = 0;

/** A call: clip player started on a fake session, three exchanges done. */
async function call(lastCallerLine = 'Okay, give me a second.') {
  const sessionId = `quirk-${++sid}`;
  const handlers = new Map<string, (ev: { newState?: string }) => void>();
  const history = llm.ChatContext.empty();
  history.addMessage({ role: 'user', content: lastCallerLine });
  const session = {
    on: (e: string, fn: (ev: { newState?: string }) => void) => handlers.set(e, fn),
    off: () => {},
    userData: { services: { sessionId } },
    history,
  };
  const clips = await startBackchannelClips({} as never, session as never, () => 'ferni', pcm);
  const agent = (s: string) => handlers.get('agent_state_changed')?.({ newState: s });
  for (let i = 0; i < 3; i++) {
    agent('speaking');
    agent('listening');
  }
  return { session, sessionId, clips: clips! };
}

/** What the next reply request carries after the caller's words, his last reply at `replyAt`. */
function nextRequest(session: object, words: string, replyAt: number): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({
    role: 'user',
    content: 'Ha, burned the toast again.',
    createdAt: replyAt - 5000,
  });
  chat.addMessage({ role: 'assistant', content: 'Classic you.', createdAt: replyAt });
  chat.addMessage({ role: 'user', content: words, createdAt: Date.now() });
  return (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
}

const QUIRK_NOTE = /\[You [^\]]*\]/g;

beforeEach(() => {
  mixer.plays = 0;
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0); // every roll passes: whistle, then snore
  vi.stubEnv('PRESENCE_SOUNDS', 'on');
  vi.stubEnv('PRESENCE_SNORE', 'on');
  vi.stubEnv('QUIRK_AWARENESS', 'on');
  vi.stubEnv('TURN_STYLE_REMINDER', 'off'); // only the note, so the assertions read it plainly
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('quirk awareness on the next reply', () => {
  it('a snore the presence watcher played reaches the next request, with its reason', async () => {
    const { session, sessionId } = await call();
    const replyAt = Date.now();
    expect(nextRequest(session, 'Okay, I am back.', replyAt)).not.toMatch(QUIRK_NOTE); // nothing yet
    vi.advanceTimersByTime(30_000); // a long quiet: whistle (~4.5 s), then snore (~18 s)
    expect(quirkEvents(sessionId).map((e) => e.kind)).toEqual(['whistle', 'snore']);
    const sent = nextRequest(session, 'Okay, I am back.', replyAt);
    expect(sent).toContain('mock snore');
    expect(sent).toContain('the line went quiet for about 18 seconds');
    expect(sent).toContain("don't announce it yourself");
    expect(sent.match(QUIRK_NOTE)).toHaveLength(1); // the cap: one line, the most notable
  });

  it('a caller asking "did you just snore?" gets the note that he owns it', async () => {
    const { session, sessionId } = await call();
    const replyAt = Date.now();
    vi.advanceTimersByTime(30_000);
    const sent = nextRequest(session, 'Wait, did you just snore?', replyAt);
    expect(sent).toContain('mock snore');
    expect(sent).toContain(
      "They seem to be asking about it: own it playfully, say why if they want to know, and don't deny it"
    );
    expect(quirkEvents(sessionId).find((e) => e.kind === 'snore')?.landed).toBe('mentioned');
  });

  it('after his next reply, only the caller bringing it up brings it back, and only for a few minutes', async () => {
    const { session } = await call();
    vi.advanceTimersByTime(30_000);
    const repliedSince = Date.now() + 1;
    vi.advanceTimersByTime(10);
    expect(nextRequest(session, 'So anyway, the toast.', repliedSince)).not.toMatch(QUIRK_NOTE);
    expect(nextRequest(session, 'Were you snoring earlier?', repliedSince)).toContain('mock snore');
    vi.advanceTimersByTime(ASK_WINDOW_MS);
    expect(nextRequest(session, 'Were you snoring earlier?', repliedSince)).not.toMatch(QUIRK_NOTE);
  });

  it('no note when nothing played, and none with QUIRK_AWARENESS off', async () => {
    vi.stubEnv('PRESENCE_SNORE', 'off');
    vi.stubEnv('PRESENCE_SOUNDS', 'off');
    const quiet = await call();
    const at = Date.now();
    vi.advanceTimersByTime(30_000);
    expect(nextRequest(quiet.session, 'Did you just snore?', at)).not.toMatch(QUIRK_NOTE);

    vi.stubEnv('PRESENCE_SOUNDS', 'on');
    vi.stubEnv('PRESENCE_SNORE', 'on');
    vi.stubEnv('QUIRK_AWARENESS', 'off');
    const off = await call();
    const at2 = Date.now();
    vi.advanceTimersByTime(30_000);
    expect(mixer.plays).toBeGreaterThan(2); // the snore did play
    expect(nextRequest(off.session, 'Did you just snore?', at2)).not.toMatch(QUIRK_NOTE);
  });

  it('a laugh-along clip is a laugh he knows about; an "mm-hm" never makes a note', async () => {
    vi.stubEnv('PRESENCE_SOUNDS', 'off');
    const { session, sessionId, clips } = await call();
    const at = Date.now();
    vi.advanceTimersByTime(10);
    expect(clips.playClip('Mm-hmm')).toBe(true);
    expect(nextRequest(session, 'and then the toaster caught fire', at)).not.toMatch(QUIRK_NOTE);
    expect(clips.playClip('[laughter]')).toBe(true);
    expect(nextRequest(session, 'haha it was a mess', at)).toContain('You laughed along with them');
    expect(quirkEvents(sessionId).map((e) => e.kind)).toEqual(['backchannel', 'laugh']);
  });
});

describe('motivation: no playful sound into a serious silence', () => {
  it('with QUIRK_AWARENESS on, venting words keep him quiet even if their voice read neutral', async () => {
    const { sessionId } = await call("I'm so stressed, I got fired today.");
    vi.advanceTimersByTime(30_000);
    expect(mixer.plays).toBe(1); // only the keep-alive silence
    expect(quirkEvents(sessionId)).toEqual([]);
  });

  it('off, the words are still read: a safety gate, not a quirk (presence-heavy.ts)', async () => {
    vi.stubEnv('QUIRK_AWARENESS', 'off');
    await call("I'm so stressed, I got fired today.");
    vi.advanceTimersByTime(30_000);
    expect(mixer.plays).toBe(1); // only the keep-alive silence
  });

  it('off, a light turn still gets its whistle and snore', async () => {
    vi.stubEnv('QUIRK_AWARENESS', 'off');
    await call('and then the toaster caught fire');
    vi.advanceTimersByTime(30_000);
    expect(mixer.plays).toBe(3); // silence, whistle, snore
  });
});

describe('a quirk that landed is remembered after the call', () => {
  const store = () => {
    const saved: Array<{ userId: string; facts: Array<{ fact: string; personaId: string }> }> = [];
    return {
      saved,
      save: async (
        userId: string,
        facts: Array<{ fact: string; personaId: string; saidAt: string }>
      ) => {
        saved.push({ userId, facts });
      },
      recent: async () => [],
    };
  };
  const ctx = (sessionId: string) => ({
    userId: 'u1',
    sessionId,
    turns: [],
    startedAt: new Date(),
  });

  it('the caller laughing right after the snore makes one ledger line', async () => {
    const { session, sessionId } = await call();
    const replyAt = Date.now();
    vi.advanceTimersByTime(30_000);
    nextRequest(session, 'hahaha', replyAt);
    const s = store();
    await rememberQuirks(ctx(sessionId), s);
    expect(s.saved).toEqual([
      {
        userId: 'u1',
        facts: [
          expect.objectContaining({
            personaId: 'ferni',
            fact: 'Ferni let out a playful mock snore during a long quiet on a call with them, and they laughed',
          }),
        ],
      },
    ]);
    expect(quirkEvents(sessionId)).toEqual([]); // the call's log is taken
  });

  it('nothing is remembered when it did not land, or for a laugh, or with the flag off', async () => {
    const s = store();
    recordQuirk('s-unlanded', { kind: 'snore', source: 'clip' });
    await rememberQuirks(ctx('s-unlanded'), s);
    recordQuirk('s-laugh', { kind: 'laugh', source: 'director', where: 'before' });
    quirkEvents('s-laugh')[0].landed = 'laughed';
    await rememberQuirks(ctx('s-laugh'), s);
    recordQuirk('s-off', { kind: 'snore', source: 'clip' });
    quirkEvents('s-off')[0].landed = 'mentioned';
    await rememberQuirks(ctx('s-off'), s, { QUIRK_AWARENESS: 'off' });
    expect(s.saved).toEqual([]);
    expect(takeQuirks('s-off')).toEqual([]); // taken even with the flag off: no leak
  });

  it('is registered by after-call-register.ts and runs from the registry endSession starts', async () => {
    vi.useRealTimers();
    // A fresh module graph, so only after-call-register.ts can have registered it.
    vi.resetModules();
    const fresh = await import('../../../services/session/after-call-tasks.js');
    expect(fresh.registeredAfterCallTasks()).not.toContain('quirk-memory');
    await import('../../after-call-register.js');
    expect(fresh.registeredAfterCallTasks()).toContain('quirk-memory');
    vi.resetModules();
    // Not landed, so the real task takes the log and writes nothing (no Firestore here).
    recordQuirk('s-registry', { kind: 'whistle', source: 'clip', personaId: 'ferni' });
    runAfterCallTasks(ctx('s-registry'));
    expect(await drainAfterCallTasks(1000)).toBe(0);
    expect(quirkEvents('s-registry')).toEqual([]);
  });
});
