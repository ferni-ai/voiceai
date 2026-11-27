/**
 * Who was talking when (turn-receipt-overlap.ts): the receipt's timing fields and
 * the CALL_END line, driven through the session events attachTurnReceipts listens
 * to, on a fake clock. Numbers and yes/no only; the last rows check no words get in.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

const ends = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const log = {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: (fields: Record<string, unknown>, msg?: string) => {
      if (msg === 'CALL_END') ends.push(fields);
    },
  };
  return { ...real, createLogger: () => log };
});

import type { TurnReceipt } from '../turn-receipt.js';
import { attachTurnReceipts } from '../turn-receipt-session.js';

/** Riley Test is fictional; the line is longer than any id, so a leak trips the length row. */
const SAID = 'Riley Test here, I wanted to talk about the move and the new job offer next month';

function call() {
  let t = 0;
  ends.length = 0;
  const activity: { pausedSpeech?: unknown } = {};
  const session = Object.assign(new EventEmitter(), { _activity: activity });
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_overlap',
    userId: 'u1',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    now: () => t,
    env: {},
  });
  const at = (ms: number) => (t = ms);
  const caller = (newState: string) => session.emit('user_state_changed', { newState });
  const ferni = (newState: string) => session.emit('agent_state_changed', { newState });
  /** LiveKit pauses the reply for the caller's voice (interruptByAudioActivity), then resumes it. */
  const pause = () => {
    activity.pausedSpeech = { handle: {} };
    session.emit('agent_state_changed', { oldState: 'speaking', newState: 'listening' });
  };
  const resume = () => {
    activity.pausedSpeech = undefined;
    ferni('speaking');
  };
  const commit = () =>
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'user', content: SAID }),
    });
  /** A reply message whose audio played from `from` to `to` (ms on the fake clock). */
  const item = (from: number, to: number, interrupted = false) => {
    const message = llm.ChatMessage.create({ role: 'assistant', content: SAID, interrupted });
    message.metrics = { startedSpeakingAt: from / 1000, stoppedSpeakingAt: to / 1000 };
    session.emit('conversation_item_added', { item: message });
  };
  return { receipts, detach, session, at, caller, ferni, pause, resume, commit, item };
}

describe('TURN_RECEIPT: who was talking when', () => {
  it('Ferni starting while the caller still talks is marked; a clean start is not', () => {
    const c = call();
    c.caller('speaking');
    c.at(1000);
    c.caller('listening');
    c.commit();
    c.at(1600);
    c.caller('speaking'); // they go on
    c.at(1900);
    c.ferni('speaking'); // and Ferni starts over them
    c.at(2600);
    c.caller('listening');
    c.at(4000);
    c.ferni('listening');
    c.at(5000);
    c.commit();
    c.at(6000);
    c.ferni('speaking');
    c.at(7000);
    c.ferni('listening');
    expect(c.receipts.map((r) => r.callerSpeakingAtFirstAudio)).toEqual([true, false]);
    expect(c.receipts.map((r) => r.callerResumedAfterCommitMs)).toEqual([600, null]);
  });

  it('a turn Ferni never speaks in has no first-audio answer', () => {
    const c = call();
    c.commit();
    c.detach();
    expect(c.receipts[0]?.callerSpeakingAtFirstAudio).toBeNull();
  });

  it('a cut times from the caller starting over Ferni to his audio stopping', () => {
    const c = call();
    c.commit();
    c.at(1000);
    c.ferni('speaking');
    c.at(3000);
    c.caller('speaking');
    c.at(3250);
    c.item(1000, 3250, true); // LiveKit adds the cut item, then says listening
    c.ferni('listening');
    expect(c.receipts[0]?.reply.interrupted).toBe(true);
    expect(c.receipts[0]?.cutLatencyMs).toBe(250);
  });

  it('an "mm-hm" over Ferni that ends while he talks on is not where a later cut starts', () => {
    const c = call();
    c.commit();
    c.at(1000);
    c.ferni('speaking');
    c.at(2000);
    c.caller('speaking'); // mm-hm
    c.at(2400);
    c.caller('listening');
    c.at(5000);
    c.caller('speaking'); // the real interruption
    c.at(5400);
    c.item(1000, 5400, true);
    c.ferni('listening');
    expect(c.receipts[0]?.cutLatencyMs).toBe(400);
  });

  it('a reply that ran to its end has no cut latency, even with an "mm-hm" over it', () => {
    const c = call();
    c.commit();
    c.at(1000);
    c.ferni('speaking');
    c.at(2000);
    c.caller('speaking');
    c.at(2300);
    c.caller('listening');
    c.at(4000);
    c.item(1000, 4000);
    c.ferni('listening');
    expect(c.receipts[0]?.reply.interrupted).toBe(false);
    expect(c.receipts[0]?.cutLatencyMs).toBeNull();
  });

  it('a cut after an "mm-hm" that ended, with no new speech over Ferni, has no start to time from', () => {
    const c = call();
    c.commit();
    c.at(1000);
    c.ferni('speaking');
    c.at(2000);
    c.caller('speaking'); // mm-hm
    c.at(2300);
    c.caller('listening');
    c.at(5000);
    c.item(1000, 5000, true); // cut for something that wasn't the caller speaking
    c.ferni('listening');
    expect(c.receipts[0]?.reply.interrupted).toBe(true);
    expect(c.receipts[0]?.cutLatencyMs).toBeNull();
  });

  it('talking over the end of a reply that finished is not a cut', () => {
    const c = call();
    c.commit();
    c.at(1000);
    c.ferni('speaking');
    c.at(3000);
    c.caller('speaking'); // and still talking when Ferni's reply ends
    c.at(4000);
    c.item(1000, 4000);
    c.ferni('listening');
    expect(c.receipts[0]?.bargeInSource).toBeNull();
    expect(c.receipts[0]?.cutLatencyMs).toBeNull();
  });

  it('a pause for the caller times the stop at the pause, not at the resumed reply end', () => {
    const c = call();
    c.commit();
    c.at(1000);
    c.ferni('speaking');
    c.at(3000);
    c.caller('speaking');
    c.at(3200);
    c.pause(); // Ferni stops for them: 200 ms
    c.at(3500);
    c.caller('listening');
    c.at(4500);
    c.resume(); // no words followed: the reply comes back
    c.at(6000);
    c.item(1000, 6000);
    c.ferni('listening');
    expect(c.receipts[0]?.bargeInSource).toBe('vad');
    expect(c.receipts[0]?.cutLatencyMs).toBe(200);
  });

  it('heardMs adds up the audio that played across the reply messages', () => {
    const c = call();
    c.commit();
    c.at(1000);
    c.ferni('speaking');
    c.item(1000, 2500);
    c.item(2500, 3000);
    c.at(3000);
    c.ferni('listening');
    expect(c.receipts[0]?.reply.heardMs).toBe(2000);
  });

  it('heardMs is null when no item carried speaking times', () => {
    const c = call();
    c.commit();
    c.ferni('speaking');
    c.session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'assistant', content: SAID }),
    });
    c.ferni('listening');
    expect(c.receipts[0]?.reply.heardMs).toBeNull();
  });
});

describe('CALL_END', () => {
  it('one line per call with its length and each side speaking time, open spans closed', () => {
    const c = call();
    c.at(500);
    c.caller('speaking');
    c.at(2500);
    c.caller('listening'); // caller 2000
    c.commit();
    c.at(3000);
    c.ferni('speaking');
    c.at(6000);
    c.ferni('listening'); // Ferni 3000
    c.at(7000);
    c.caller('speaking'); // still talking at the end: 1000 more
    c.at(8000);
    c.session.emit('close');
    c.detach();
    expect(ends).toEqual([
      {
        event: 'CALL_END',
        sessionId: 'RM_overlap',
        durationMs: 8000,
        callerSpeechMs: 3000,
        agentSpeechMs: 3000,
      },
    ]);
  });
});

describe('no words in the new fields or CALL_END', () => {
  const strings = (v: unknown): string[] =>
    typeof v === 'string'
      ? [v]
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(strings)
        : [];

  it('the timing fields are numbers, yes/no or null', () => {
    const c = call();
    c.commit();
    c.ferni('speaking');
    c.caller('speaking');
    c.ferni('listening');
    c.item(0, 10, true);
    c.detach();
    const r = c.receipts[0] as TurnReceipt;
    const fields = [
      r.callerSpeakingAtFirstAudio,
      r.callerResumedAfterCommitMs,
      r.cutLatencyMs,
      r.reply.heardMs,
    ];
    for (const v of fields) expect(['number', 'boolean', 'object']).toContain(typeof v);
    expect(fields.filter((v) => typeof v === 'object').every((v) => v === null)).toBe(true);
  });

  it('no string in a receipt or CALL_END is longer than an id, and none is what was said', () => {
    const c = call();
    c.caller('speaking');
    c.caller('listening');
    c.commit();
    c.ferni('speaking');
    c.caller('speaking');
    c.ferni('listening');
    c.item(0, 10, true);
    c.detach();
    const all = [...c.receipts.flatMap(strings), ...ends.flatMap(strings)];
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((s) => s.length > 40)).toEqual([]);
    expect(JSON.stringify([c.receipts, ends])).not.toContain('Riley');
  });
});
