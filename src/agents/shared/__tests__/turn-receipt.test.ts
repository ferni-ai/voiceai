/**
 * TURN_RECEIPT: one line per caller turn, built from the session's events and
 * the request as sent, with no words in it.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-context-header.js';
import { attachTurnReceipts, noteReminder, noteRequest } from '../turn-receipt-session.js';
import { sentenceCount, userKindOf, type TurnReceipt } from '../turn-receipt.js';
import { createFirstAudioObserver } from '../../../speech/tts-gateway/first-audio-observer.js';
import { promptSections } from '../prompt-sections.js';
import { withActionClaimCheck } from '../../personas/action-claim-guard.js';
import { holdReplyAudio } from '../../../speech/output-control/reply-activity.js';
import { noteTurnTiming } from '../../../speech/output-control/turn-timing.js';

const INSTRUCTIONS = 'You are Ferni, a warm friend on a call.';
const RECALL = '[WHAT YOU REMEMBER ABOUT JANE]\n- Jane Doe: phone = +1 555 867 5309';
const DIRECTOR = '[Director: ask Jane Doe about jane@example.com]';
const REMINDER = `Already told: the lake story. ${DIRECTOR} Keep it short, a friend on a call.`;
const CALLER = 'my name is Jane Doe, call me at +1 555 867 5309 or jane@example.com';
const REPLY = 'Hey Jane Doe! Got it. I will call +1 555 867 5309?';
const PII = [
  'Jane',
  'Doe',
  '555',
  '867',
  '5309',
  'jane@example.com',
  'lake story',
  'uid-secret-123',
];

/** A request as llmNode sends it: instructions, recall, history, a tool round, this turn + reminder. */
function request(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: INSTRUCTIONS, id: 'lk.agent_task.instructions' });
  ctx.addMessage({ role: 'system', content: RECALL, id: 'recall_1' });
  ctx.addMessage({ role: 'user', content: 'hi there' });
  ctx.addMessage({ role: 'user', content: `${TURN_CONTEXT_HEADER}\nJane sounds tired.` });
  ctx.insert(
    llm.FunctionCall.create({ callId: 'c1', name: 'getWeather', args: '{"city":"Jane town"}' })
  );
  ctx.insert(
    llm.FunctionCallOutput.create({
      callId: 'c1',
      name: 'getWeather',
      output: 'sunny',
      isError: false,
    })
  );
  ctx.addMessage({ role: 'assistant', content: 'hey you' });
  ctx.addMessage({
    role: 'user',
    content: [CALLER, `\n\n(${REMINDER})`, '\n\n(Crisis: be gentle.)'],
  });
  return ctx;
}

describe('promptSections', () => {
  it('accounts for every character of the request, by source', () => {
    const items = request().items;
    const sections = promptSections(items as never, {
      reminder: REMINDER,
      directorNotes: DIRECTOR,
      offered: 2,
      droppedIdx: [1],
    });
    const by = Object.fromEntries(sections.map((s) => [s.name, s]));
    expect(by.instructions.chars).toBe(INSTRUCTIONS.length);
    expect(by.instructions.source).toBe('agent-instructions.ts');
    expect(by.memory_recall.chars).toBe(RECALL.length);
    expect(by.turn_context.items).toBe(1);
    expect(by.history_user.chars).toBe('hi there'.length);
    expect(by.history_assistant.chars).toBe('hey you'.length);
    expect(by.tool_io.chars).toBe(
      'getWeather'.length + '{"city":"Jane town"}'.length + 'sunny'.length
    );
    expect(by.caller_turn.chars).toBe(CALLER.length);
    expect(by.director_notes.chars).toBe(DIRECTOR.length);
    expect(by.turn_reminder.chars).toBe(`\n\n(${REMINDER})`.length - DIRECTOR.length);
    expect(by.crisis_guidance.chars).toBe('\n\n(Crisis: be gentle.)'.length);

    // Sums: sections cover the whole request, and each estimate is chars/4.
    const allText = items.reduce((n, item) => {
      if (item.type === 'message')
        return n + item.content.reduce((m, c) => m + (typeof c === 'string' ? c.length : 0), 0);
      if (item.type === 'function_call') return n + item.name.length + item.args.length;
      if (item.type === 'function_call_output') return n + item.output.length;
      return n;
    }, 0);
    expect(sections.reduce((n, s) => n + s.chars, 0)).toBe(allText);
    for (const s of sections) expect(s.tokensEst).toBe(Math.ceil(s.chars / 4));
  });

  it('without a reminder note, the appended reminder counts as guidance, never as caller words', () => {
    const sections = promptSections(request().items as never);
    const by = Object.fromEntries(sections.map((s) => [s.name, s]));
    expect(by.caller_turn.chars).toBe(CALLER.length);
    expect(by.director_notes).toBeUndefined();
  });
});

describe('helpers', () => {
  it('buckets the caller without exposing them', () => {
    expect(userKindOf(undefined)).toBe('other');
    expect(userKindOf('voice-eval-story-20261011101010-ab12')).toBe('eval');
    expect(userKindOf('uid-1', { TURN_RECEIPT_OWNER_UIDS: 'uid-0, uid-1' })).toBe('owner');
    expect(userKindOf('uid-2', { TURN_RECEIPT_OWNER_UIDS: 'uid-1' })).toBe('other');
  });

  it('counts sentences', () => {
    expect(sentenceCount('')).toBe(0);
    expect(sentenceCount('mm')).toBe(1);
    expect(sentenceCount('Hey! Got it. Call you at 5.30?')).toBe(3);
  });
});

/** A session double: real EventEmitter, the events LiveKit emits, a clock we drive. */
function call(opts: { userId?: string } = {}) {
  const session = new EventEmitter();
  const receipts: TurnReceipt[] = [];
  let t = 1_000_000;
  let persona = 'ferni';
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_test',
    userId: opts.userId ?? 'uid-secret-123',
    persona: () => persona,
    emit: (r) => receipts.push(r),
    now: () => t,
    env: {},
  });
  const metric = (m: Record<string, unknown>) => session.emit('metrics_collected', { metrics: m });
  const state = (newState: string) => session.emit('agent_state_changed', { newState });
  const item = (role: string, text: string, interrupted = false) =>
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: role as 'user', content: text, interrupted }),
    });
  const turn = (
    o: { tools?: string[]; swapTo?: string; interrupted?: boolean; unrecorded?: boolean } = {}
  ) => {
    const stoppedAt = t;
    t += 300;
    metric({
      type: 'eou_metrics',
      endOfUtteranceDelayMs: 300,
      transcriptionDelayMs: 90,
      lastSpeakingTimeMs: stoppedAt,
    });
    item('user', CALLER);
    state('thinking');
    noteReminder(session, {
      reminder: REMINDER,
      directorNotes: DIRECTOR,
      offered: 2,
      droppedIdx: [1],
    });
    noteRequest(session, request(), {
      functionTools: { getWeather: {}, handoffToMaya: {}, endCall: {} },
    });
    if (o.tools) {
      session.emit('function_tools_executed', {
        functionCalls: o.tools.map((name) =>
          llm.FunctionCall.create({ callId: name, name, args: `{"to":"${CALLER}"}` })
        ),
        functionCallOutputs: o.tools.map((name) =>
          llm.FunctionCallOutput.create({
            callId: name,
            name,
            output: CALLER,
            isError: name === 'getWeather',
          })
        ),
      });
    }
    if (o.swapTo) persona = o.swapTo;
    t += 500;
    metric({
      type: 'llm_metrics',
      ttftMs: 450,
      timestamp: t + 200,
      durationMs: 700,
      promptTokens: 4000,
      promptCachedTokens: 3000,
      completionTokens: 20,
    });
    metric({ type: 'tts_metrics', ttfbMs: 150, cancelled: Boolean(o.interrupted) });
    t += 200;
    state('speaking');
    t += 1500;
    if (!o.unrecorded) item('assistant', REPLY, Boolean(o.interrupted));
    state('listening');
  };
  return {
    session,
    receipts,
    detach,
    turn,
    state,
    item,
    metric,
    setPersona: (p: string) => (persona = p),
  };
}

describe('attachTurnReceipts', () => {
  it('reports a handoff as switched when the swap lands after the turn ends', () => {
    // Prod: the swap waits for the goodbye, so the turn ended with the old persona still on.
    const c = call();
    c.turn({ tools: ['handoffToMaya'] });
    expect(c.receipts).toHaveLength(0); // held until the outcome is known
    c.setPersona('maya');
    c.turn();
    expect(c.receipts[0]).toMatchObject({
      turn: 1,
      personaId: 'maya',
      tools: { handoff: { attempted: true, tool: 'handoffToMaya', result: 'switched' } },
    });
    expect(c.receipts[0].timing.replyDoneMs).toBe(c.receipts[1].timing.replyDoneMs);
  });

  it('reports a handoff that never swapped as stayed, at the latest when the call ends', () => {
    const c = call();
    c.turn({ tools: ['handoffToMaya'] });
    c.detach();
    expect(c.receipts).toHaveLength(1);
    expect(c.receipts[0].tools.handoff.result).toBe('stayed');
    expect(c.receipts[0].personaId).toBe('ferni');
  });

  it('emits one receipt per caller turn, with timings, prompt, tools and reply', () => {
    const c = call();
    c.turn({ tools: ['getWeather', 'handoffToMaya'], swapTo: 'maya' });
    expect(c.receipts).toHaveLength(1);
    const r = c.receipts[0];
    expect(r).toMatchObject({
      event: 'TURN_RECEIPT',
      v: 1,
      sessionId: 'RM_test',
      turn: 1,
      personaId: 'maya',
      userKind: 'other',
      endedBy: 'listening',
      timing: {
        eouDelayMs: 300,
        transcriptionDelayMs: 90,
        llmTtftMs: 450,
        ttsTtfbMs: 150,
        commitToAudioMs: 700,
        firstAudioMs: 1000,
        replyDoneMs: 2500,
      },
      tokens: { prompt: 4000, promptCached: 3000, completion: 20 },
      director: { offered: 2, kept: 1, droppedIdx: [1] },
      tools: {
        offered: 3,
        called: ['getWeather', 'handoffToMaya'],
        errors: 1,
        handoff: { attempted: true, tool: 'handoffToMaya', result: 'switched' },
      },
      reply: {
        messages: 1,
        chars: REPLY.length,
        sentences: 3,
        interrupted: false,
        ttsCancelled: false,
        unrecorded: false,
      },
    });
    // First token: request start (timestamp - duration) + TTFT, from the end of speech.
    expect(r.timing.llmReadyMs).toBe(750);
    expect(r.prompt.estimate).toBe('chars/4');
    expect(r.prompt.requests).toBe(1);
    expect(r.prompt.totalTokensEst).toBe(r.prompt.sections.reduce((n, s) => n + s.tokensEst, 0));
    expect(r.prompt.totalTokensEst).toBeGreaterThan(0);
  });

  // Prod 2026-10-12: from turn 8 of one call no reply reached the history, and the
  // model answered the same questions again ("Gujarati is what I grew up with" x4).
  it('flags a turn where Ferni spoke but no reply reached the chat history', () => {
    const c = call();
    c.turn();
    c.turn({ unrecorded: true });
    expect(c.receipts.map((r) => [r.reply.messages, r.reply.unrecorded])).toEqual([
      [1, false],
      [0, true],
    ]);
  });

  // Prod speaks through the TTS gateway, which never emits the SDK's tts_metrics:
  // ttsTtfbMs was null in 135/135 receipts (SDK speech audit 2026-10-13).
  it("records the TTS gateway's first audio for this session's reply only", () => {
    const c = call();
    c.metric({ type: 'eou_metrics', endOfUtteranceDelayMs: 300, lastSpeakingTimeMs: 1 });
    c.item('user', CALLER);
    c.state('thinking');
    const theirs = createFirstAudioObserver({ sessionId: 'RM_other', startTime: Date.now() - 50 });
    theirs();
    const ours = createFirstAudioObserver({ sessionId: 'RM_test', startTime: Date.now() - 420 });
    ours.stage('push');
    ours();
    c.state('speaking');
    c.item('assistant', REPLY);
    c.state('listening');
    const timing = c.receipts[0]?.timing;
    expect(timing?.ttsTtfbMs).toBeGreaterThanOrEqual(420);
    expect(timing?.ttsTtfbMs).toBeLessThan(2000);
    expect(timing?.ttsPushMs).not.toBeNull();
  });

  it('carries no transcript, reply, tool argument, note, name, number or uid', () => {
    const c = call();
    c.turn({ tools: ['getWeather'] });
    const json = JSON.stringify(c.receipts);
    expect(c.receipts).toHaveLength(1);
    for (const pii of PII) expect(json).not.toContain(pii);
  });

  it('counts each turn once: two signals per commit, greetings and repeats aside', () => {
    const c = call();
    // The greeting: Ferni speaks unprompted, no caller turn.
    c.state('thinking');
    c.state('speaking');
    c.item('assistant', 'Hey, good to hear you.');
    c.state('listening');
    expect(c.receipts).toHaveLength(0);
    c.turn();
    c.turn({ interrupted: true });
    c.state('listening'); // a repeat state change adds nothing
    expect(c.receipts.map((r) => [r.turn, r.reply.interrupted, r.reply.ttsCancelled])).toEqual([
      [1, false, false],
      [2, true, true],
    ]);
  });

  it('emits a turn left open when the next commit comes first, and at the end of the call', () => {
    const c = call();
    c.metric({
      type: 'eou_metrics',
      endOfUtteranceDelayMs: 300,
      transcriptionDelayMs: 90,
      lastSpeakingTimeMs: 1,
    });
    c.state('thinking');
    c.session.emit('function_tools_executed', {
      functionCalls: [{ name: 'setTimer' }],
      functionCallOutputs: [],
    });
    c.metric({
      type: 'eou_metrics',
      endOfUtteranceDelayMs: 300,
      transcriptionDelayMs: 90,
      lastSpeakingTimeMs: 2,
    });
    expect(c.receipts.map((r) => r.endedBy)).toEqual(['superseded']);
    c.detach();
    expect(c.receipts.map((r) => r.endedBy)).toEqual(['superseded', 'session_end']);
    c.detach(); // idempotent
    expect(c.receipts).toHaveLength(2);
  });

  it('needs a recorder: notes on a session without one do nothing', () => {
    expect(() => noteRequest({}, request(), {})).not.toThrow();
    expect(() =>
      noteReminder({}, { reminder: '', directorNotes: '', offered: 0, droppedIdx: [] })
    ).not.toThrow();
  });
});

// A latency A/B is credited turn by turn: which holds kept the first words back, and which arm.
describe('holds, first audio and flags', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  const SID = 'RM_holds';

  /** A model stream whose words we hand over one at a time. */
  function model() {
    let push!: (text: string) => void;
    let end!: () => void;
    const stream = new ReadableStream<string>({
      start(c) {
        push = (text) => c.enqueue(text);
        end = () => c.close();
      },
    });
    return { stream, push: (t: string) => push(t), end: () => end() };
  }

  function receiptsOn(env?: Record<string, string>) {
    const session = new EventEmitter();
    const receipts: TurnReceipt[] = [];
    const detach = attachTurnReceipts(session as never, {
      sessionId: SID,
      userId: 'uid-1',
      persona: () => 'ferni',
      emit: (r) => receipts.push(r),
      env,
    });
    const commit = (stoppedAt: number) => {
      session.emit('metrics_collected', {
        metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 300, lastSpeakingTimeMs: stoppedAt },
      });
      session.emit('agent_state_changed', { newState: 'thinking' });
    };
    const reply = () => {
      session.emit('agent_state_changed', { newState: 'speaking' });
      session.emit('conversation_item_added', {
        item: llm.ChatMessage.create({ role: 'assistant', content: 'Sure, that works.' }),
      });
      session.emit('agent_state_changed', { newState: 'listening' });
    };
    return { session, receipts, detach, commit, reply };
  }

  it("times the guard's real hold and keeps it out of the provider's TTFB", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const env = { ACTION_CLAIM_STREAM: 'off', BUILD_SHA: 'abc1234', CASCADE_TURN_EAGER: '0.4' };
    const c = receiptsOn(env);
    const stoppedAt = Date.now();
    vi.advanceTimersByTime(300);
    c.commit(stoppedAt);
    const ttsStart = Date.now(); // the TTS node starts with the request
    const m = model();
    const caller = { personaId: 'ferni', services: { sessionId: SID } };
    const guarded = await withActionClaimCheck(m.stream, { items: [] }, {}, caller, env);
    const reader = (guarded as ReadableStream<unknown>).getReader();
    vi.advanceTimersByTime(100);
    noteTurnTiming(SID, 'openerAudio', 40); // an "Mm" reaches the wire 40 ms later
    vi.advanceTimersByTime(100);
    m.push('Sure, '); // the model's first words: held until the sentence is whole
    await vi.advanceTimersByTimeAsync(300);
    m.push('that works. ');
    m.end();
    expect(await reader.read()).toMatchObject({ done: false });
    const obs = createFirstAudioObserver({ sessionId: SID, startTime: ttsStart });
    obs.stage('push'); // the words reach the provider
    await vi.advanceTimersByTimeAsync(180); // the provider's own wait for audio
    holdReplyAudio(SID, 250); // the "Mm" is still playing: the reply waits for it
    const held = obs.hold();
    await vi.advanceTimersByTimeAsync(250);
    await held;
    obs();
    c.reply();
    const r = c.receipts[0];
    expect(r.holds.actionClaimHoldMs).toBe(300);
    expect(r.holds.openerClipMs).toBe(250);
    expect(r.holds.pauseHoldMs).toBe(0);
    expect([r.holds.openerGateMs, r.holds.crisisHoldMs, r.holds.unfinishedTurnMs]).toEqual([
      null,
      null,
      null,
    ]);
    expect(r.timing.ttsPushMs).toBe(500); // model 200 + the guard's 300
    expect(r.timing.ttsTtfbMs).toBe(930); // ...+ provider 180 + clip 250
    expect(r.audio.providerTtfbMs).toBe(180);
    expect(r.audio.firstAnyAudioMs).toBe(300 + 140); // the "Mm" on the wire
    expect(r.audio.firstReplyAudioMs).toBe(300 + 930);
    expect(r.timing.firstAudioMs).toBe(r.audio.firstReplyAudioMs);
    expect(r.flags).toMatchObject({
      ACTION_CLAIM_STREAM: 'off',
      ACTION_CLAIM_GUARD: 'on', // the manifest default
      CASCADE_TURN_EAGER: '0.4',
    });
    expect(r.commit).toBe('abc1234');
    c.detach();
  });

  it('reads the flags when the receipt is built, as a cohort set them for this caller', () => {
    vi.stubEnv('TURN_LENGTH', 'on'); // applyCallerFlags writes process.env at call start
    vi.stubEnv('CASCADE_TURN_EAGER', 'sk-not-a-number');
    const c = receiptsOn(); // no env: process.env, as on a live call
    c.commit(Date.now() - 500);
    c.reply();
    vi.stubEnv('TURN_LENGTH', 'off');
    c.commit(Date.now() - 500);
    c.reply();
    expect(c.receipts.map((r) => r.flags.TURN_LENGTH)).toEqual(['on', 'off']);
    expect(c.receipts[0].flags.CASCADE_TURN_EAGER).toBe('<set>'); // never a non-number value
    c.detach();
  });

  it("does not count a hold after Ferni was heard, or another call's", () => {
    const c = receiptsOn({});
    c.commit(Date.now() - 500);
    noteTurnTiming('RM_other', 'crisis', 900);
    noteTurnTiming(SID, 'crisis', 120);
    c.reply();
    expect(c.receipts[0].holds.crisisHoldMs).toBe(120);
    c.commit(Date.now() - 500);
    c.session.emit('agent_state_changed', { newState: 'speaking' });
    noteTurnTiming(SID, 'crisis', 700); // a later request's hold: the caller already heard Ferni
    c.reply();
    expect(c.receipts[1].holds.crisisHoldMs).toBeNull();
    c.detach();
  });
});
