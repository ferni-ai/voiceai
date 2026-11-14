/**
 * The log lines our @livekit/agents patch adds (patches/@livekit__agents@1.9.3.patch)
 * carry lengths, never the caller's words: a caller's words do not go into logs
 * outside a dev environment, and the SDK patch keeps no dev exception of its own.
 *
 * Each test drives the installed, patched SDK code down one marker's path with an
 * invented transcript, then checks that the marker was logged (the path ran), that
 * its length field matches the transcript, and that no value in that log call holds
 * the transcript or any 8-character piece of it. The check is per marker call: the
 * stock SDK logs words itself at debug level under `lk.pii.*` keys, which is not ours.
 *
 * livekit-patch-log-guard.test.ts reads the patch file itself, so a new log line
 * that passes text fails before it is ever installed.
 */
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireSdk = createRequire(import.meta.url);
const agentsDist = dirname(requireSdk.resolve('@livekit/agents'));

/** The patch edits both builds of each file: the ESM `.js` and the CommonJS `.cjs` twin. */
const TWINS = ['js', 'cjs'] as const;
type Twin = (typeof TWINS)[number];

/** One installed SDK module, from the ESM build or its CommonJS twin. */
async function load<T>(twin: Twin, file: string): Promise<T> {
  if (twin === 'cjs') return requireSdk(join(agentsDist, file.replace(/\.js$/, '.cjs'))) as T;
  return (await import(pathToFileURL(join(agentsDist, file)).href)) as T;
}

interface LogCall {
  level: string;
  args: unknown[];
}

/** A logger double that records every call at every level. */
function recordingLogger() {
  const calls: LogCall[] = [];
  const at =
    (level: string) =>
    (...args: unknown[]) => {
      calls.push({ level, args });
    };
  const logger: Record<string, unknown> = {
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    debug: at('debug'),
    trace: at('trace'),
    fatal: at('fatal'),
  };
  logger.child = () => logger;
  /** Every argument of the one call that logged `marker`; fails unless there is exactly one. */
  const call = (marker: string): unknown[] => {
    const hits = calls.filter((c) => c.args.includes(marker));
    expect(hits, `${marker} logged once`).toHaveLength(1);
    return hits[0]?.args ?? [];
  };
  /** The fields object of that call. */
  const fields = (marker: string): Record<string, unknown> =>
    call(marker)[0] as Record<string, unknown>;
  return { logger, calls, call, fields };
}

/** Every 8-character piece of `text` (the whole of it when shorter). */
function pieces(text: string): string[] {
  if (text.length <= 8) return [text];
  return Array.from({ length: text.length - 7 }, (_, i) => text.slice(i, i + 8));
}

/** Pieces of any of `texts` found in the logged values. Empty when none. */
function leaked(values: unknown, ...texts: string[]): string[] {
  const logged = JSON.stringify(values);
  return texts.flatMap(pieces).filter((p) => logged.includes(p));
}

type Method = (this: unknown, ...args: unknown[]) => unknown;

async function activityMethod(twin: Twin, name: string): Promise<Method> {
  const mod = await load<{ AgentActivity: { prototype: Record<string, Method> } }>(
    twin,
    'voice/agent_activity.js'
  );
  const method = mod.AgentActivity.prototype[name];
  if (!method) throw new Error(`AgentActivity has no ${name}`);
  return method;
}

/** The parts of an AgentActivity that onEndOfTurn reads (livekit-backchannel-turn.test.ts). */
function endOfTurnActivity(logger: unknown, opts: { paused: boolean; holdMs?: number }) {
  return {
    agentSession: {
      userState: 'listening',
      amd: undefined,
      chatCtx: { items: [] },
      sessionOptions: { turnHandling: { interruption: { minWords: 0 } } },
      unfinishedTurnHoldMs: opts.holdMs === undefined ? undefined : () => opts.holdMs,
    },
    schedulingPaused: false,
    newTurnsBlocked: false,
    stt: {},
    turnDetection: 'stt',
    _currentSpeech: undefined,
    pausedSpeech: opts.paused ? { handle: { interrupted: false }, timeout: 2000 } : undefined,
    closeAbort: { signal: { aborted: false } },
    audioRecognition: { speaking: false, audioTranscript: '', runEOUDetection: vi.fn() },
    logger,
    cancelPreemptiveGeneration: vi.fn(),
    startFalseInterruptionTimer: vi.fn(),
    cancelFalseInterruptionTimer: vi.fn(),
    createSpeechTask: vi.fn(() => ({ done: false })),
    userTurnCompleted: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe.each(TWINS)('agent_activity.%s: patch log lines carry lengths', (twin) => {
  it('BACKCHANNEL_KEEPS_PAUSE logs the length of the backchannel', async () => {
    const said = 'Yeah, okay, totally, gotcha.';
    const rec = recordingLogger();
    const fn = await activityMethod(twin, 'onFinalTranscript');
    const a = {
      ...endOfTurnActivity(rec.logger, { paused: true }),
      agentSession: {
        amd: undefined,
        emit: vi.fn(),
        sessionOptions: { turnHandling: { interruption: { falseInterruptionTimeout: 2000 } } },
      },
      audioRecognition: {},
      interruptByAudioActivity: vi.fn(),
      cancelSpeechPause: vi.fn(async () => undefined),
    };
    fn.call(a, { alternatives: [{ text: said, language: 'en' }] }, true);
    expect(a.cancelSpeechPause).not.toHaveBeenCalled(); // the patched branch kept the pause
    const f = rec.fields('BACKCHANNEL_KEEPS_PAUSE');
    expect(f).toEqual({ user_input_len: said.length });
    expect(leaked(rec.call('BACKCHANNEL_KEEPS_PAUSE'), said)).toEqual([]);
  });

  it('BACKCHANNEL_NOT_A_TURN logs the length of the dropped backchannel', async () => {
    vi.useFakeTimers();
    const said = 'Yeah, okay, totally, gotcha.';
    const rec = recordingLogger();
    const fn = await activityMethod(twin, 'onEndOfTurn');
    const a = endOfTurnActivity(rec.logger, { paused: true });
    expect(await fn.call(a, { newTranscript: said })).toBe(true);
    expect(a.createSpeechTask).not.toHaveBeenCalled();
    expect(rec.fields('BACKCHANNEL_NOT_A_TURN')).toEqual({ user_input_len: said.length });
    expect(leaked(rec.call('BACKCHANNEL_NOT_A_TURN'), said)).toEqual([]);
  });

  it('UNFINISHED_TURN_HELD logs the length and keeps holdMs', async () => {
    vi.useFakeTimers();
    const said = 'the lighthouse keeper painted the';
    const rec = recordingLogger();
    const fn = await activityMethod(twin, 'onEndOfTurn');
    const a = endOfTurnActivity(rec.logger, { paused: false, holdMs: 1234 });
    a.audioRecognition.audioTranscript = said;
    expect(await fn.call(a, { newTranscript: said })).toBe(false); // held, not committed
    expect(rec.fields('UNFINISHED_TURN_HELD')).toEqual({
      user_input_len: said.length,
      holdMs: 1234,
    });
    expect(leaked(rec.call('UNFINISHED_TURN_HELD'), said)).toEqual([]);
  });

  it('PREEMPTIVE_DECISION logs preflight and final lengths with its booleans unchanged', async () => {
    const preflight = 'which tulips bloom first along the fence';
    const final = 'which tulips bloom first along the fence by the shed';
    const rec = recordingLogger();
    const prototype = await load<{
      AgentActivity: { prototype: { userTurnCompleted: Method; userTurnCompletedImpl: Method } };
    }>(twin, 'voice/agent_activity.js').then((m) => m.AgentActivity.prototype);
    const preemptiveHandle = { id: 'speech_pre', _cancel: vi.fn() };
    const a = {
      agentSession: new EventEmitter(),
      llm: {},
      schedulingPaused: false,
      newTurnsBlocked: false,
      _currentSpeech: undefined,
      interruptQueuedSpeeches: vi.fn(),
      tools: { equals: () => true },
      toolChoice: undefined,
      agent: { chatCtx: { copy: () => ({}) }, onUserTurnCompleted: async () => undefined },
      _preemptiveGeneration: {
        speechHandle: preemptiveHandle,
        userMessage: { content: [] },
        info: { newTranscript: preflight },
        chatCtx: { isEquivalent: () => true },
        tools: { equals: () => true },
        toolChoice: undefined,
        createdAt: Date.now() - 200,
      },
      logger: rec.logger,
      scheduleSpeech: vi.fn(),
      generateReply: vi.fn(() => ({ id: 'speech_final' })),
      userTurnCompletedImpl: prototype.userTurnCompletedImpl,
    };
    await prototype.userTurnCompleted.call(a, {
      newTranscript: final,
      endOfUtteranceDelay: 300,
      stoppedSpeakingAt: Date.now(),
    });
    const f = rec.fields('PREEMPTIVE_DECISION');
    expect(f).toMatchObject({
      used: false,
      sameTranscript: false,
      sameChatCtx: true,
      sameTools: true,
      sameToolChoice: true,
      preflight_len: preflight.length,
      final_len: final.length,
    });
    expect(typeof f.leadMs).toBe('number');
    expect(Object.keys(f).sort()).toEqual(
      [
        'used',
        'sameTranscript',
        'sameChatCtx',
        'sameTools',
        'sameToolChoice',
        'leadMs',
        'preflight_len',
        'final_len',
      ].sort()
    );
    expect(leaked(rec.call('PREEMPTIVE_DECISION'), preflight, final)).toEqual([]);
  });
});

interface Recognition {
  logger: unknown;
  onSTTEvent: (ev: unknown) => Promise<void>;
  onStartOfAgentSpeech: (at: number) => Promise<unknown>;
  onStartOfOverlapSpeech: (speechDuration: number, startedAt: number) => Promise<void>;
  applyOverlapSpeechEvent: (ev: {
    isInterruption: boolean;
    detectedAt: number;
    overlapStartedAt: number;
    agentEnded: boolean;
  }) => void;
}

/** A real AudioRecognition with held-transcript handling on (livekit-held-end-of-speech.test.ts). */
async function recognition(twin: Twin) {
  const { initializeLogger } = await load<{ initializeLogger: (o: object) => void }>(
    twin,
    'log.js'
  );
  initializeLogger({ pretty: false, level: 'silent' });
  const { AudioRecognition } = await load<{ AudioRecognition: new (o: object) => Recognition }>(
    twin,
    'voice/audio_recognition.js'
  );
  const { SpeechEventType } = await load<{ SpeechEventType: Record<string, number> }>(
    twin,
    'stt/stt.js'
  );
  const { ChatContext } = await load<{ ChatContext: { empty: () => unknown } }>(
    twin,
    'llm/chat_context.js'
  );
  const hooks = {
    onInterruption: vi.fn(),
    onStartOfSpeech: vi.fn(),
    onVADInferenceDone: vi.fn(),
    onEndOfSpeech: vi.fn(),
    onInterimTranscript: vi.fn(),
    onFinalTranscript: vi.fn(),
    onEndOfTurn: vi.fn(async () => true),
    onPreemptiveGeneration: vi.fn(),
    onAgentBackchannelOpportunity: vi.fn(),
    onUserTurnExceeded: vi.fn(),
    onEotPrediction: vi.fn(),
    onBackchannelConfirmed: vi.fn(),
    retrieveChatCtx: () => ChatContext.empty(),
  };
  const r = new AudioRecognition({
    recognitionHooks: hooks,
    stt: async () => new ReadableStream(),
    vad: {},
    interruptionDetection: {},
    turnDetectionMode: 'stt',
    minEndpointingDelay: 0,
    maxEndpointingDelay: 0,
  });
  const rec = recordingLogger();
  r.logger = rec.logger;
  const final = (text: string) => ({
    type: SpeechEventType.FINAL_TRANSCRIPT,
    alternatives: [{ text, language: 'en', startTime: 0, endTime: 0, confidence: 0.9 }],
  });
  const endOfSpeech = { type: SpeechEventType.END_OF_SPEECH };
  return { r, rec, final, endOfSpeech, SpeechEventType };
}

const later = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

describe.each(TWINS)('audio_recognition.%s: patch log lines carry lengths', (twin) => {
  it('END_OF_SPEECH_PASSTHROUGH logs the length of the pending transcript', async () => {
    const said = 'So the kettle finally whistled.';
    const { r, rec, final, endOfSpeech } = await recognition(twin);
    await r.onSTTEvent(final(said));
    const replyAt = Date.now();
    await r.onStartOfAgentSpeech(replyAt);
    await r.onStartOfOverlapSpeech(0, replyAt);
    await r.onSTTEvent(endOfSpeech);
    const f = rec.fields('END_OF_SPEECH_PASSTHROUGH');
    expect(f).toEqual({ transcript_len: said.length, agentSpeaking: expect.any(Boolean) });
    expect(leaked(rec.call('END_OF_SPEECH_PASSTHROUGH'), said)).toEqual([]);
  });

  it('HELD_STT_DROPPED logs each dropped event as type:length, and the pending length', async () => {
    const pending = 'I folded them all on Sunday';
    const said = 'seventeen paper cranes on the sill';
    const { r, rec, final, endOfSpeech, SpeechEventType } = await recognition(twin);
    await r.onSTTEvent(final(pending)); // went through: the pending transcript
    const replyAt = Date.now();
    await r.onStartOfAgentSpeech(replyAt);
    await r.onStartOfOverlapSpeech(0, replyAt);
    await r.onSTTEvent(final(said)); // held: the caller spoke over Ferni
    await r.onSTTEvent(endOfSpeech);
    await later();
    r.applyOverlapSpeechEvent({
      isInterruption: false, // a backchannel verdict trims the held events
      detectedAt: Date.now(),
      overlapStartedAt: replyAt,
      agentEnded: false,
    });
    const f = rec.fields('HELD_STT_DROPPED');
    expect(f).toEqual({
      dropped: [
        `${SpeechEventType.FINAL_TRANSCRIPT}:${said.length}`,
        `${SpeechEventType.END_OF_SPEECH}:0`,
      ],
      audioTranscript_len: pending.length,
    });
    expect(leaked(rec.call('HELD_STT_DROPPED'), said, pending)).toEqual([]);
  });
});
