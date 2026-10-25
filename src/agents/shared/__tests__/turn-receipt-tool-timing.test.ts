/**
 * TURN_RECEIPT tool-turn fields (turn-receipt-tool-timing.ts): every model request,
 * each tool's run, and the answer's own first audio apart from a lead-in's.
 * Driven through attachTurnReceipts with the events LiveKit emits and a real
 * SpeechHandle, whose _itemAdded is what the SDK calls as a tool starts and returns.
 */
import { EventEmitter } from 'node:events';
import { llm, voice } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { attachTurnReceipts, noteRequest } from '../turn-receipt-session.js';
import type { TurnReceipt } from '../turn-receipt.js';
import { noteTurnTiming } from '../../../speech/output-control/turn-timing.js';

const CALLER = 'whats the weather in Janesville for Jane Doe at 555-0100';

function call() {
  const session = new EventEmitter();
  const receipts: TurnReceipt[] = [];
  let t = 1_000_000;
  const stop = t;
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_tools',
    userId: 'voice-eval-x',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    now: () => t,
    env: {},
  });
  const at = (ms: number) => (t = stop + ms); // ms after the caller stopped
  const state = (newState: string) => session.emit('agent_state_changed', { newState });
  const request = () =>
    noteRequest(session, { items: [] }, { functionTools: { getWeather: {}, endCall: {} } });
  const llmDone = (startMs: number, ttftMs: number, durationMs: number, cancelled = false) =>
    session.emit('metrics_collected', {
      metrics: {
        type: 'llm_metrics',
        ttftMs,
        durationMs,
        timestamp: stop + startMs + durationMs,
        promptTokens: 4000,
        completionTokens: 12,
        cancelled,
      },
    });
  const commit = () => {
    at(150);
    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 150, lastSpeakingTimeMs: stop },
    });
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'user', content: CALLER }),
    });
    state('thinking');
  };
  const speech = () => {
    const handle = voice.SpeechHandle.create();
    session.emit('speech_created', { speechHandle: handle });
    return handle;
  };
  const tool = (handle: voice.SpeechHandle, startMs: number, endMs: number) => {
    const fc = llm.FunctionCall.create({ callId: 'c1', name: 'getWeather', args: `"${CALLER}"` });
    at(startMs);
    handle._itemAdded([fc]); // agent_activity onToolExecutionStarted
    at(endMs);
    handle._itemAdded([
      llm.FunctionCallOutput.create({
        callId: 'c1',
        name: 'getWeather',
        output: CALLER,
        isError: false,
      }),
    ]);
    session.emit('function_tools_executed', { functionCalls: [fc], functionCallOutputs: [] });
  };
  const reply = () => {
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'assistant', content: 'sunny, Jane' }),
    });
    state('listening');
  };
  return { receipts, detach, at, state, request, llmDone, commit, speech, tool, reply };
}

describe('TURN_RECEIPT tool-turn timing', () => {
  it('a lead-in tool turn: two requests, the tool run, and the answer heard after the lead-in', () => {
    const c = call();
    c.commit();
    c.request(); // request 1 at 150
    const handle = c.speech();
    c.tool(handle, 1100, 1220); // the tool runs while "Let me look." is synthesized
    c.at(1300);
    c.state('speaking'); // the lead-in
    c.llmDone(150, 950, 1200);
    c.at(2000);
    c.state('thinking'); // lead-in played out; the SDK sends request 2
    c.request();
    c.at(3100);
    c.state('speaking'); // the answer
    c.llmDone(2000, 900, 1500);
    c.reply();

    expect(c.receipts).toHaveLength(1);
    const r = c.receipts[0];
    expect(r.prompt.requests).toBe(2);
    expect(r.timing.requests).toEqual([
      { startMs: 150, ttftMs: 950, durationMs: 1200 },
      { startMs: 2000, ttftMs: 900, durationMs: 1500 },
    ]);
    expect(r.tools.runs).toEqual([{ name: 'getWeather', startMs: 1100, endMs: 1220 }]);
    expect(r.tools.execMs).toEqual({ getWeather: 120 });
    expect(r.timing.firstAudioMs).toBe(1300); // the lead-in
    expect(r.audio.answerAudioMs).toBe(3100); // the answer itself
    expect(r.audio.answerAudioMs).not.toBe(r.timing.firstAudioMs);
    expect(r.timing.handoffSteps).toBeNull();
    // ids and numbers only: nothing the caller said or the tool returned
    const line = JSON.stringify(r);
    for (const word of ['Jane', 'Janesville', '555-0100', 'sunny'])
      expect(line).not.toContain(word);
  });

  it('with no lead-in, the answer is the first audio', () => {
    const c = call();
    c.commit();
    c.request();
    c.tool(c.speech(), 1000, 1020);
    c.llmDone(150, 850, 900);
    c.at(1030);
    c.request();
    c.at(2200);
    c.state('speaking');
    c.reply();
    const r = c.receipts[0];
    expect(r.audio.answerAudioMs).toBe(2200);
    expect(r.audio.answerAudioMs).toBe(r.timing.firstAudioMs);
    expect(r.timing.requests).toHaveLength(1); // request 2's metric never came
  });

  it('a no-tool turn has no answer split and no runs; a dropped preemptive request is marked', () => {
    const c = call();
    c.llmDone(-400, -1, 300, true); // preemptive, dropped before its first token
    c.commit();
    c.request();
    c.at(1400);
    c.state('speaking');
    c.llmDone(150, 1000, 1400);
    c.reply();
    const r = c.receipts[0];
    expect(r.audio.answerAudioMs).toBeNull();
    expect(r.tools.runs).toEqual([]);
    expect(r.tools.execMs).toEqual({});
    expect(r.timing.requests).toEqual([
      { startMs: -400, ttftMs: null, durationMs: 300, cancelled: true },
      { startMs: 150, ttftMs: 1000, durationMs: 1400 },
    ]);
  });

  it('handoff steps and an ack clip are timed from the caller stop', () => {
    const c = call();
    c.commit();
    c.request();
    c.at(1200);
    noteTurnTiming('RM_tools', 'handoffEvent', 0);
    c.at(1210);
    noteTurnTiming('RM_tools', 'handoffLock', 0);
    noteTurnTiming('OTHER_ROOM', 'handoffPublished', 0); // another call's: not this turn's
    c.at(1250);
    noteTurnTiming('RM_tools', 'handoffPublished', 0);
    noteTurnTiming('RM_tools', 'ackClip', 40);
    c.at(2000);
    c.state('speaking');
    c.reply();
    const r = c.receipts[0];
    expect(r.timing.handoffSteps).toEqual({ eventMs: 1200, lockMs: 1210, publishedMs: 1250 });
    expect(r.audio.ackClipMs).toBe(1290);
    expect(r.audio.firstAnyAudioMs).toBe(1290); // the clip was heard before the reply
    expect(r.timing.firstAudioMs).toBe(2000);
  });
});
