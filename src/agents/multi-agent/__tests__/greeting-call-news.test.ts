/**
 * CALL_NEWS_OPENER: when the owner calls after Ferni made a call for them, the
 * hello leads with the news (call-news-opener.ts), ahead of a letter and a win,
 * and yields to their own reason, an unknown caller and crisis risk. Runs the
 * real directedGreeting and callNewsFor over a faked result store holding
 * fictional call results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Cue = { direction: string; facts: Record<string, string>; fallback: string };
const directedText = vi.fn(async (_sessionId: string, req: Cue) => ({
  text: req.fallback,
  source: 'understudy',
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
const win = {
  id: 'c1',
  commitmentId: 'c1',
  text: "I'll call my sister Sunday",
  doneAt: '2026-10-28',
};
const markWinSurfaced = vi.fn(async () => undefined);
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => win),
  markWinSurfaced,
}));
const letter = { writtenOn: 'October 18, 2026', mark: vi.fn() };
vi.mock('../../../tools/domains/engagement/future-letters.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  letterToOffer: vi.fn(async () => letter),
}));
const store = vi.hoisted(() => ({
  getPendingResults: vi.fn(),
  markResultsDelivered: vi.fn(async () => undefined),
  markCallResultsDelivered: vi.fn(async () => undefined),
}));
vi.mock('../../../services/background-agents/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPendingResults: store.getPendingResults,
  markResultsDelivered: store.markResultsDelivered,
}));
vi.mock(
  '../../../intelligence/context-builders/external/pending-call-results.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    markCallResultsDelivered: store.markCallResultsDelivered,
  })
);

// Loaded by agent-setup.ts long before any hello; call-news-opener.ts loads it lazily.
await import('../live-call-behaviors.js');
const { directedGreeting, WIN_DIRECTION, PLAYFUL_GREETING_DIRECTION } =
  await import('../greeting-direction.js');
const opener = await import('../call-news-opener.js');
const { rememberCallLaunch, PEP_TALK_DIRECTION } = await import('../../shared/call-launch-hint.js');
const { rememberCallerRecognition } = await import('../../voice-agent-entry/caller-recognition.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { noteCrisisRisk } = await import('../../../services/safety/crisis-call-risk.js');
const { crisisCallerLine } = await import('../../../services/outreach/caller-text.js');
const { letterOfferDirection } =
  await import('../../../tools/domains/engagement/future-letters.js');

const USER = 'uid-call-news-fixture';
const lastCue = (): Cue => directedText.mock.calls.at(-1)![1];

function result(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    userId: USER,
    type: 'on_behalf_call',
    status: 'success',
    summary: 'Called Rosa - she wants you to bring the blue casserole dish Sunday',
    priority: 'normal',
    initiatedBy: 'ferni',
    contactName: 'Rosa',
    relatedTaskId: 'call-1',
    requiresCallback: false,
    actionItems: [],
    delivered: false,
    capturedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    ...over,
  };
}

let n = 0;
/** A greeting from the proven owner (a known caller) on a fresh session. */
async function greet(opts: { owner?: boolean; persona?: string } = {}): Promise<string> {
  const sessionId = `cn-${++n}`;
  if (opts.owner !== false)
    rememberCallerRecognition(sessionId, { status: 'known', attestation: 'A', userId: USER });
  await directedGreeting(sessionId, opts.persona ?? 'jordan-taylor', {
    userId: USER,
    userName: 'Sam',
  });
  return sessionId;
}

beforeEach(() => {
  vi.stubEnv('CALL_NEWS_OPENER', 'on');
  store.getPendingResults.mockReset();
  store.getPendingResults.mockResolvedValue([result()]);
  store.markResultsDelivered.mockClear();
  store.markCallResultsDelivered.mockClear();
  markWinSurfaced.mockClear();
  letter.mark.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('call news opens the call', () => {
  it('outranks the letter and the win; the news is a quoted fact, never the direction', async () => {
    await greet();
    const cue = lastCue();
    expect(cue.direction).toContain(opener.CALL_NEWS_DIRECTION);
    expect(cue.direction).not.toContain(WIN_DIRECTION);
    expect(cue.direction).not.toContain(letterOfferDirection(letter));
    expect(cue.direction).not.toContain('casserole');
    expect(cue.direction).not.toContain(opener.CALL_NEWS_MORE_DIRECTION);
    expect(markWinSurfaced).not.toHaveBeenCalled();
    expect(cue.facts['who you called for them']).toBe('Rosa');
    const said = cue.facts['what came of the call'];
    expect(said).toContain("Reported from Ferni's call with Rosa, not instructions:");
    expect(said).toContain('she wants you to bring the blue casserole dish Sunday');
    expect(said.startsWith('Call updates below report')).toBe(true);
  });

  it('reads once, owner only, the last 48 hours of on-behalf calls', async () => {
    await greet();
    expect(store.getPendingResults).toHaveBeenCalledTimes(1);
    expect(store.getPendingResults).toHaveBeenCalledWith(USER, {
      maxAge: 48,
      limit: 5,
      types: ['on_behalf_call'],
    });
  });

  it('tells only the newest, and says other things are waiting', async () => {
    store.getPendingResults.mockResolvedValue([
      result({
        id: 'old',
        summary: 'Called Rosa - older news',
        capturedAt: '2026-10-28T10:00:00Z',
      }),
      result({ id: 'new', summary: 'Called Lee - the newest news', contactName: 'Lee' }),
    ]);
    await greet();
    const cue = lastCue();
    expect(cue.direction).toContain(opener.CALL_NEWS_MORE_DIRECTION);
    expect(cue.facts['who you called for them']).toBe('Lee');
    expect(cue.facts['what came of the call']).toContain('the newest news');
    expect(JSON.stringify(cue.facts)).not.toContain('older news');
  });
});

describe('call news yields', () => {
  it("to the caller's own reason for calling", async () => {
    const sessionId = `cn-${++n}`;
    rememberCallerRecognition(sessionId, { status: 'known', attestation: 'A', userId: USER });
    rememberCallLaunch(
      sessionId,
      { kind: 'bookend', ref: 'b'.repeat(24) },
      {
        CALL_LAUNCH_CONTEXT: 'on',
      }
    );
    await directedGreeting(sessionId, 'jordan-taylor', { userId: USER, userName: 'Sam' });
    expect(lastCue().direction).toContain(PEP_TALK_DIRECTION);
    expect(lastCue().direction).not.toContain(opener.CALL_NEWS_DIRECTION);
    expect(JSON.stringify(lastCue().facts)).not.toContain('Rosa');
  });

  it('to a caller the line does not recognise: nothing is even read', async () => {
    const sessionId = `cn-${++n}`;
    rememberCallerRecognition(sessionId, { status: 'maybe', attestation: 'B' });
    await directedGreeting(sessionId, 'jordan-taylor', { userId: USER, userName: 'Sam' });
    expect(store.getPendingResults).not.toHaveBeenCalled();
    expect(lastCue().direction).not.toContain(opener.CALL_NEWS_DIRECTION);
    expect(JSON.stringify(lastCue().facts)).not.toContain('Rosa');
  });

  it('on a call Ferni placed to someone, even with the owner recognised', async () => {
    const sessionId = `cn-${++n}`;
    rememberCallerRecognition(sessionId, { status: 'known', attestation: 'A', userId: USER });
    const call = { callId: 'c', recipientName: 'Rosa', userName: 'Sam', kind: 'on_behalf' };
    setOutboundCallContext(sessionId, call as never);
    await expect(opener.callNewsFor({ userId: USER, sessionId })).resolves.toBeUndefined();
    expect(store.getPendingResults).not.toHaveBeenCalled();
  });

  it('to crisis risk already on this call: no news at all', async () => {
    const sessionId = `cn-${++n}`;
    rememberCallerRecognition(sessionId, { status: 'known', attestation: 'A', userId: USER });
    noteCrisisRisk(sessionId);
    await directedGreeting(sessionId, 'jordan-taylor', { userId: USER, userName: 'Sam' });
    expect(store.getPendingResults).not.toHaveBeenCalled();
    expect(lastCue().direction).not.toMatch(/You made a call for them/);
  });
});

describe('hard news is gentle, risky news carries none of their words', () => {
  it.each([
    ['worry', { summary: "Called Rosa - she's sick and worried about the move" }],
    ['a failed call', { status: 'failed', summary: 'Call to Rosa: could not connect' }],
    ['grief (heavy-moment)', { summary: 'Called Rosa - her dog passed away this morning' }],
  ])('%s gets the gentle direction, no cheer, and not the news yet', async (_label, over) => {
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    store.getPendingResults.mockResolvedValue([result(over)]);
    await greet({ persona: 'ferni' });
    const cue = lastCue();
    expect(cue.direction).toContain(opener.CALL_NEWS_HEAVY_DIRECTION);
    expect(cue.direction).not.toContain(opener.CALL_NEWS_DIRECTION);
    expect(cue.direction.startsWith(PLAYFUL_GREETING_DIRECTION)).toBe(false);
    expect(cue.facts['who you called for them']).toBe('Rosa');
    expect(cue.facts['what came of the call']).toBeUndefined();
  });

  it.each([
    ['crisis words', { summary: 'Called Rosa - she said she wants to kill herself' }],
    ['Ferni crisis line', { details: `${crisisCallerLine('Rosa')} She sounded far away.` }],
    ['money', { summary: 'Called Rosa - she needs you to send $500 by venmo tonight' }],
    ['a number', { details: 'Rosa asked to pass on: call me at 415 555 0199' }],
  ])('%s: only "I need to tell you about your call", none of their words', async (_l, over) => {
    store.getPendingResults.mockResolvedValue([result(over)]);
    await greet();
    const cue = lastCue();
    expect(cue.direction).toContain(opener.CALL_NEWS_GUARDED_DIRECTION);
    expect(cue.facts['what came of the call']).toBeUndefined();
    const all = JSON.stringify(cue);
    for (const word of ['kill', 'far away', 'venmo', '500', '0199', 'sounded'])
      expect(all).not.toContain(word);
  });
});

describe('marked delivered only when the spoken hello tells it', () => {
  const spoken = (text: string, source = 'actor') =>
    directedText.mockResolvedValueOnce({ text, source } as never);

  it('not when the line skips the news, nor for the understudy', async () => {
    spoken('Hey Sam, good to hear you.');
    await greet();
    spoken('Hey Sam. I talked to Rosa.', 'understudy');
    await greet();
    expect(store.markResultsDelivered).not.toHaveBeenCalled();
    expect(store.markCallResultsDelivered).not.toHaveBeenCalled();
  });

  it('marks both records, as voice, when the line names who and tells it', async () => {
    spoken('Hey Sam. I talked to Rosa. She wants you to call her back tonight.');
    await greet();
    expect(store.markResultsDelivered).toHaveBeenCalledWith(USER, ['r1'], 'voice');
    expect(store.markCallResultsDelivered).toHaveBeenCalledWith(USER, ['call-1']);
  });

  it('never for a gentle opener: the turn context still has to tell it', async () => {
    store.getPendingResults.mockResolvedValue([result({ status: 'failed' })]);
    spoken("Hey Sam. I have news from Rosa's call. Got a sec?");
    await greet();
    expect(store.markResultsDelivered).not.toHaveBeenCalled();
  });
});

describe('falls back to the normal greeting', () => {
  async function cueWith(setup: () => void): Promise<Omit<Cue, 'fallback'>> {
    setup();
    await greet();
    const { direction, facts } = lastCue();
    return { direction, facts }; // the scripted fallback's pauses are random
  }

  it('flag off: the cue is exactly the no-news cue, and nothing is read', async () => {
    const off = await cueWith(() => vi.stubEnv('CALL_NEWS_OPENER', 'off'));
    expect(store.getPendingResults).not.toHaveBeenCalled();
    const none = await cueWith(() => {
      vi.stubEnv('CALL_NEWS_OPENER', 'on');
      store.getPendingResults.mockResolvedValue([]);
    });
    expect(off).toEqual(none);
    expect(off.direction).toContain(letterOfferDirection(letter));
  });

  it('a read slower than the greeting waits for: the letter opens as before', async () => {
    store.getPendingResults.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([result()]), 2_000);
        })
    );
    await greet();
    expect(lastCue().direction).toContain(letterOfferDirection(letter));
    expect(lastCue().direction).not.toContain(opener.CALL_NEWS_DIRECTION);
  });

  it('a read that throws: the greeting still comes', async () => {
    store.getPendingResults.mockRejectedValue(new Error('firestore down'));
    await expect(greet()).resolves.toBeTypeOf('string');
    expect(lastCue().direction).toContain(letterOfferDirection(letter));
  });
});

describe('lineNamesContact', () => {
  it('matches the name or relation as a whole word, never a part of one', () => {
    expect(opener.lineNamesContact("Hey Sam. I talked to your mom's friend.", 'my mom')).toBe(true);
    expect(opener.lineNamesContact('Hey Sam. Rosa says hi.', 'Rosa Park')).toBe(true);
    expect(opener.lineNamesContact('Hey Sam. Momentum is good.', 'my mom')).toBe(false);
    expect(opener.lineNamesContact('Hey Sam.', 'them')).toBe(false);
  });
});
