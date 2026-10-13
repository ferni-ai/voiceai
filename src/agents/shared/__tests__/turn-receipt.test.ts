/**
 * TURN_RECEIPT: one line per caller turn, built from the session's events and
 * the request as sent, with no words in it.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import {
  attachTurnReceipts,
  noteRequest,
  sentenceCount,
  userKindOf,
  type TurnReceipt,
} from '../turn-receipt.js';
import { createFirstAudioObserver } from '../../../speech/tts-gateway/first-audio-observer.js';

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
    expect(r.prompt).toEqual({ requests: 1, lane: null });
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

  it('needs a recorder: a request on a session without one does nothing', () => {
    expect(() => noteRequest({}, request(), {})).not.toThrow();
  });
});
