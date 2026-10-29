/**
 * Ferni doesn't answer half a sentence (unfinished-turn.ts and the
 * UNFINISHED_TURN_HELD hunk of patches/@livekit__agents@1.9.3.patch).
 *
 * Dev call, 2026-10-03: "We don't get" | "caught up in reviews." got a reply
 * to "We don't get"; so did "When you go to sleep, what do you dream" | "of?".
 */
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DANGLING_HOLD_MS,
  UNPUNCTUATED_HOLD_MS,
  installUnfinishedTurnHold,
  reportUnfinishedTurnHolds,
  unfinishedTurnHoldMs,
  unfinishedness,
} from '../unfinished-turn.js';
import { attachTurnReceipts } from '../../shared/turn-receipt-session.js';
import type { TurnReceipt } from '../../shared/turn-receipt.js';

const PAUSE_OFF = { PAUSE_REQUEST_COMMITS_TURN: 'off' };
const PAUSE_ON = { PAUSE_REQUEST_COMMITS_TURN: 'on' };

/** Pause requests and how long main held each before #3047 (and holds again with the flag off). */
const PAUSE_REQUESTS_HELD_MS: ReadonlyArray<readonly [string, number]> = [
  ['hold on', DANGLING_HOLD_MS],
  ['Hang on', DANGLING_HOLD_MS],
  ['wait', UNPUNCTUATED_HOLD_MS],
  ['please wait', UNPUNCTUATED_HOLD_MS],
  ['no wait', UNPUNCTUATED_HOLD_MS],
  ['oh no wait', UNPUNCTUATED_HOLD_MS],
  ['wait wait wait', UNPUNCTUATED_HOLD_MS],
  ['can you wait', UNPUNCTUATED_HOLD_MS],
  ['just wait', UNPUNCTUATED_HOLD_MS],
  ['will you hold on', DANGLING_HOLD_MS],
  // Seth, 2026-10-29: callers go on after these too; 1500 ms is their pre-#3047 hold.
  ['enough', UNPUNCTUATED_HOLD_MS],
  ['Quiet', UNPUNCTUATED_HOLD_MS],
  ['pause', UNPUNCTUATED_HOLD_MS],
  ['pause it', UNPUNCTUATED_HOLD_MS],
  ['please pause', UNPUNCTUATED_HOLD_MS],
];

/** A pause request, or a stop word, with the caller going on: always a held turn. */
const CONTINUATIONS = [
  'hold on, let me think',
  'hold on let me think about what I want to say',
  'Hold on, I need to find my keys',
  'hang on a second while I check',
  'hang on, my other line is ringing',
  'wait, I wanted to ask',
  'wait I wanted to ask you something',
  'wait what did you just say',
  'no wait that is not what I meant',
  'oh no wait I forgot to mention',
  'wait wait wait that is not right',
  'can you wait a second',
  'can you wait until I am done',
  'just wait until you hear this',
  'please wait while I get my glasses',
  'will you hold on for a moment',
  'will you hold on to this for me',
  'can you stop by the store',
  'Hey Ferni can you stop by the store on the way',
  'stop me if I am rambling',
  'please stop telling me what to do',
  "don't stop",
  'I wish you would stop and',
  'you can stop worrying about it',
  'enough about me, how are you',
  'quiet down, the kids are sleeping',
  'pause for a second while I think',
  'enough of that, tell me about your day',
  'quiet please, the baby is asleep',
  'pause it there and let me think',
];

describe('unfinishedness', () => {
  it('holds the fragments ink ended turns on in the 2026-10-03 call', () => {
    for (const fragment of [
      "We don't get",
      'When you go to sleep, what do you dream',
      "All right, now to, it's not",
      "I don't say she goes",
      'moves cross into enemy',
    ]) {
      expect(unfinishedTurnHoldMs(fragment), fragment).toBeGreaterThan(0);
    }
  });

  it('answers finished turns at once', () => {
    for (const finished of [
      'All right, brother.',
      "It's hard to say.",
      'Why do you keep forgetting?',
      'caught up in reviews.',
      "We don't get caught up in reviews.",
      'When you go to sleep, what do you dream of?',
      'What are you thinking of?',
      'Yeah',
      'mm-hmm',
      'No',
      '',
    ]) {
      expect(unfinishedTurnHoldMs(finished), finished).toBe(0);
    }
  });

  it('waits longer when the turn ends on a word that needs more', () => {
    expect(unfinishedness('I was going to')).toBe('dangling');
    expect(unfinishedness('and then, um')).toBe('dangling');
    expect(unfinishedness('So I told her,')).toBe('dangling');
    expect(unfinishedness("I don't say she goes")).toBe('unpunctuated');
    expect(unfinishedTurnHoldMs('I was going to')).toBe(DANGLING_HOLD_MS);
    expect(unfinishedTurnHoldMs("I don't say she goes")).toBe(UNPUNCTUATED_HOLD_MS);
  });

  it('waits on a thinking filler even though it is also a backchannel word', () => {
    // "um", "uh" and "yeah, um" are someone gathering a thought, not "go on":
    // the backchannel check ran first and answered them at once.
    for (const thinking of ['Um', 'uh', 'Yeah, um', 'Okay so um', 'I', 'So I']) {
      expect(unfinishedness(thinking), thinking).toBe('dangling');
    }
    // a lone "yeah" or "mm-hmm" is still a whole turn
    expect(unfinishedness('Yeah')).toBe('finished');
    expect(unfinishedness('mm-hmm')).toBe('finished');
  });

  it('answers a stop command at once, punctuated or not, flag or no flag (#2657)', () => {
    // prod AJ_JbTguxw4hwRw: music playing, held twice, the stop came 4.4 s late
    expect(unfinishedTurnHoldMs('Hey, Ferni, can you')).toBe(UNPUNCTUATED_HOLD_MS); // lead-in alone
    for (const command of [
      'Hey, Ferni, can you stop',
      'stop',
      'Stop the music',
      'could you please stop it now',
      'you can stop',
      'just enough',
      'Pause the music please',
      'stop it',
      'stop that',
      'stop talking',
      'stop playing',
      'turn it off',
      'shut it off',
      'shh',
      'Shhh',
      'shush',
      'be quiet',
      "That's enough",
      'no, stop',
      'okay turn it off',
    ]) {
      for (const env of [PAUSE_OFF, PAUSE_ON]) {
        expect(unfinishedness(command, env), command).toBe('finished');
        expect(unfinishedTurnHoldMs(command, env), command).toBe(0);
      }
    }
  });

  it('holds a lone pause request as main did before #3047 (PAUSE_REQUEST_COMMITS_TURN off)', () => {
    // "hold on" ends on a dangling word (2 s); "wait" is just unpunctuated (1.5 s).
    for (const [request, ms] of PAUSE_REQUESTS_HELD_MS) {
      expect(unfinishedTurnHoldMs(request, PAUSE_OFF), request).toBe(ms);
      expect(unfinishedTurnHoldMs(request, {}), `${request} (unset)`).toBe(ms);
    }
  });

  it('commits a lone pause request at once when PAUSE_REQUEST_COMMITS_TURN is on (#3047)', () => {
    for (const [request] of PAUSE_REQUESTS_HELD_MS) {
      expect(unfinishedness(request, PAUSE_ON), request).toBe('finished');
      expect(unfinishedTurnHoldMs(request, PAUSE_ON), request).toBe(0);
    }
  });

  it('holds a pause request that the caller goes on past, flag or no flag', () => {
    for (const sentence of CONTINUATIONS) {
      for (const env of [PAUSE_OFF, PAUSE_ON]) {
        expect(unfinishedTurnHoldMs(sentence, env), sentence).toBeGreaterThan(0);
      }
    }
  });

  it('still holds a turn that only mentions stopping or goes on past it', () => {
    for (const held of [
      "don't stop",
      "I can't stop",
      'stop and',
      'stop,',
      'wait what',
      'hold on to',
      'please',
      'they never stop',
      'Hey Ferni can you stop by the store',
    ]) {
      expect(unfinishedTurnHoldMs(held), held).toBeGreaterThan(0);
    }
  });

  it('installs on the session unless UNFINISHED_TURN_HOLD=off', () => {
    const on: { unfinishedTurnHoldMs?: unknown } = {};
    expect(installUnfinishedTurnHold(on, {})).toBe(true);
    expect(on.unfinishedTurnHoldMs).toBe(unfinishedTurnHoldMs);
    const off: { unfinishedTurnHoldMs?: unknown } = {};
    expect(installUnfinishedTurnHold(off, { UNFINISHED_TURN_HOLD: 'off' })).toBe(false);
    expect(off.unfinishedTurnHoldMs).toBeUndefined();
  });
});

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
type OnEndOfTurn = (this: unknown, info: { newTranscript: string }) => Promise<boolean>;

async function onEndOfTurn(): Promise<OnEndOfTurn> {
  const mod = (await import(pathToFileURL(join(agentsDist, 'voice/agent_activity.js')).href)) as {
    AgentActivity: { prototype: { onEndOfTurn: OnEndOfTurn } };
  };
  return mod.AgentActivity.prototype.onEndOfTurn;
}

/** The parts of an AgentActivity that onEndOfTurn reads, with the hold installed. */
function activity() {
  const session = {
    amd: undefined,
    chatCtx: { items: [] },
    sessionOptions: { turnHandling: { interruption: { minWords: 0 } } },
  };
  installUnfinishedTurnHold(session, {});
  return {
    agentSession: session,
    schedulingPaused: false,
    newTurnsBlocked: false,
    stt: {},
    turnDetection: 'stt',
    _currentSpeech: undefined,
    pausedSpeech: undefined,
    closeAbort: { signal: { aborted: false } },
    audioRecognition: { speaking: false, audioTranscript: '', runEOUDetection: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    cancelPreemptiveGeneration: vi.fn(),
    startFalseInterruptionTimer: vi.fn(),
    cancelFalseInterruptionTimer: vi.fn(),
    createSpeechTask: vi.fn(() => ({ done: false })),
    userTurnCompleted: vi.fn(),
  };
}

describe('LiveKit end of turn on an unfinished sentence (patched)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('does not reply to "We don\'t get" while the caller may go on', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = "We don't get";
    expect(await fn.call(a, { newTranscript: "We don't get" })).toBe(false); // not committed
    expect(a.createSpeechTask).not.toHaveBeenCalled();
  });

  it('answers the joined sentence once when the caller goes on', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = "We don't get";
    await fn.call(a, { newTranscript: "We don't get" });
    // ink's next final joins the pending words; its end of turn commits them.
    a.audioRecognition.audioTranscript = "We don't get caught up in reviews.";
    expect(await fn.call(a, { newTranscript: "We don't get caught up in reviews." })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DANGLING_HOLD_MS + UNPUNCTUATED_HOLD_MS);
    expect(a.audioRecognition.runEOUDetection).not.toHaveBeenCalled(); // the hold was dropped
  });

  it('answers the fragment after the hold when the caller says nothing more', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = "I don't say she goes";
    await fn.call(a, { newTranscript: "I don't say she goes" });
    vi.advanceTimersByTime(UNPUNCTUATED_HOLD_MS - 1);
    expect(a.audioRecognition.runEOUDetection).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a.audioRecognition.runEOUDetection).toHaveBeenCalledTimes(1);
    // The re-run reaches onEndOfTurn with the same words: now it commits.
    expect(await fn.call(a, { newTranscript: "I don't say she goes" })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
  });

  it('leaves a turn alone while the caller is speaking again', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = 'When you go to sleep, what do you dream';
    await fn.call(a, { newTranscript: 'When you go to sleep, what do you dream' });
    a.audioRecognition.speaking = true;
    vi.advanceTimersByTime(DANGLING_HOLD_MS);
    expect(a.audioRecognition.runEOUDetection).not.toHaveBeenCalled();
  });

  it('commits "Hey, Ferni, can you stop" at once instead of holding it (#2657)', async () => {
    const fn = await onEndOfTurn();
    const held = activity();
    held.audioRecognition.audioTranscript = 'Hey, Ferni, can you';
    expect(await fn.call(held, { newTranscript: 'Hey, Ferni, can you' })).toBe(false);
    const a = activity();
    a.audioRecognition.audioTranscript = 'Hey, Ferni, can you stop';
    expect(await fn.call(a, { newTranscript: 'Hey, Ferni, can you stop' })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UNPUNCTUATED_HOLD_MS + DANGLING_HOLD_MS);
    expect(a.audioRecognition.runEOUDetection).not.toHaveBeenCalled(); // nothing was held
  });

  it('does not reply to "hold on" when the caller goes on, unless the flag is on (#2657)', async () => {
    // The #3047 verifier's split final: "hold on" | "hold on let me think about what I want to say".
    const joined = 'hold on let me think about what I want to say.'; // ink punctuates a finished sentence
    vi.stubEnv('PAUSE_REQUEST_COMMITS_TURN', 'off');
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = 'hold on';
    expect(await fn.call(a, { newTranscript: 'hold on' })).toBe(false);
    expect(a.createSpeechTask).not.toHaveBeenCalled(); // no reply to the fragment
    a.audioRecognition.audioTranscript = joined;
    expect(await fn.call(a, { newTranscript: joined })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1); // one reply, to the whole sentence

    vi.stubEnv('PAUSE_REQUEST_COMMITS_TURN', 'on');
    const b = activity();
    b.audioRecognition.audioTranscript = 'hold on';
    expect(await fn.call(b, { newTranscript: 'hold on' })).toBe(true);
    expect(b.createSpeechTask).toHaveBeenCalledTimes(1); // #3047: the fragment is answered
  });

  it.each([
    ['enough', 'enough about me, how are you?'],
    ['quiet', 'quiet down, the kids are sleeping.'],
    ['pause', 'pause for a second while I think.'],
  ])(
    'does not reply to "%s" when the caller goes on, unless the flag is on',
    async (word, joined) => {
      const fn = await onEndOfTurn();
      vi.stubEnv('PAUSE_REQUEST_COMMITS_TURN', 'off');
      const a = activity();
      a.audioRecognition.audioTranscript = word;
      expect(await fn.call(a, { newTranscript: word })).toBe(false);
      expect(a.createSpeechTask).not.toHaveBeenCalled(); // no reply to the fragment
      a.audioRecognition.audioTranscript = joined;
      expect(await fn.call(a, { newTranscript: joined })).toBe(true);
      expect(a.createSpeechTask).toHaveBeenCalledTimes(1);

      vi.stubEnv('PAUSE_REQUEST_COMMITS_TURN', 'on');
      const b = activity();
      b.audioRecognition.audioTranscript = word;
      expect(await fn.call(b, { newTranscript: word })).toBe(true); // as on main today
    }
  );

  it('commits a lone "wait" and "please wait" at once only with the flag on', async () => {
    const fn = await onEndOfTurn();
    for (const [flag, committed] of [
      ['off', false],
      ['on', true],
    ] as const) {
      vi.stubEnv('PAUSE_REQUEST_COMMITS_TURN', flag);
      for (const said of ['hang on', 'wait', 'please wait']) {
        const a = activity();
        a.audioRecognition.audioTranscript = said;
        expect(await fn.call(a, { newTranscript: said }), `${said} (${flag})`).toBe(committed);
      }
    }
  });

  it.each(['off', 'on'])(
    'commits "stop", "that\'s enough", "you can stop", "be quiet", "pause the music" at once (flag %s)',
    async (flag) => {
      vi.stubEnv('PAUSE_REQUEST_COMMITS_TURN', flag);
      const fn = await onEndOfTurn();
      for (const said of ['stop', "that's enough", 'you can stop', 'be quiet', 'pause the music']) {
        const a = activity();
        a.audioRecognition.audioTranscript = said;
        expect(await fn.call(a, { newTranscript: said }), said).toBe(true);
        expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
      }
    }
  );

  it('answers finished turns without waiting', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    expect(await fn.call(a, { newTranscript: 'Why do you keep forgetting?' })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
  });
});

// The TURN_RECEIPT's unfinishedTurnMs: what the hold really cost the turn, decision to commit.
describe('unfinished-turn hold on the TURN_RECEIPT', () => {
  beforeEach(() => vi.useFakeTimers({ now: 5_000_000 }));
  afterEach(() => vi.useRealTimers());

  function receipts() {
    const session = new EventEmitter();
    const out: TurnReceipt[] = [];
    const detach = attachTurnReceipts(session as never, {
      sessionId: 'RM_unfinished',
      userId: 'uid-1',
      persona: () => 'ferni',
      emit: (r) => out.push(r),
      env: {},
    });
    /** LiveKit committed the turn, and Ferni answered it. */
    const committed = () => {
      session.emit('metrics_collected', {
        metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 300, lastSpeakingTimeMs: 1 },
      });
      session.emit('agent_state_changed', { newState: 'speaking' });
      session.emit('agent_state_changed', { newState: 'listening' });
    };
    return { out, detach, committed };
  }

  it('counts a hold that ran out, from the decision to the commit', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    reportUnfinishedTurnHolds(a.agentSession, 'RM_unfinished');
    const r = receipts();
    a.audioRecognition.audioTranscript = "I don't say she goes";
    expect(await fn.call(a, { newTranscript: "I don't say she goes" })).toBe(false);
    vi.advanceTimersByTime(UNPUNCTUATED_HOLD_MS);
    expect(await fn.call(a, { newTranscript: "I don't say she goes" })).toBe(true); // the re-run
    r.committed();
    expect(r.out[0].holds.unfinishedTurnMs).toBe(UNPUNCTUATED_HOLD_MS);
    r.detach();
  });

  it('counts nothing when the caller went on and finished the sentence', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    reportUnfinishedTurnHolds(a.agentSession, 'RM_unfinished');
    const r = receipts();
    a.audioRecognition.audioTranscript = "We don't get";
    await fn.call(a, { newTranscript: "We don't get" });
    vi.advanceTimersByTime(400);
    a.audioRecognition.audioTranscript = "We don't get caught up in reviews.";
    expect(await fn.call(a, { newTranscript: "We don't get caught up in reviews." })).toBe(true);
    r.committed();
    expect(r.out[0].holds.unfinishedTurnMs).toBeNull();
    r.detach();
  });
});
