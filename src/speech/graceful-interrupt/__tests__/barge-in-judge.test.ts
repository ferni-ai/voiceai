/**
 * The "Oh—" / "Mm?" soft opening only follows a real barge-in.
 *
 * Dev call, 2026-10-03: "Mm?" opened the answer to "What more can we do to
 * make you human?" after two overlaps LiveKit resumed from as false
 * interruptions, and Ferni's reply then played to the end.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLLISION_MS,
  MAX_REPLY_LEAD_MS,
  REAL_BARGE_IN_MS,
  createBargeInJudge,
  noteReplyLead,
  registerBargeInJudge,
  softenAfterInterrupt,
} from '../barge-in-judge.js';
import { createInterruptAwareTransform } from '../speech-wrapper.js';

/** A judge on a fake clock, with helpers to replay a call. */
function call() {
  let clock = 0;
  const judge = createBargeInJudge(() => clock);
  return {
    judge,
    wait: (ms: number) => (clock += ms),
    ferni: (state: string) => judge.onAgentState(state),
    caller: (state: string) => judge.onUserState(state),
  };
}

describe('createBargeInJudge', () => {
  it('ignores overlaps LiveKit resumed from, once the reply played out (the "Mm?" case)', () => {
    const { judge, wait, ferni, caller } = call();
    ferni('speaking');
    wait(1200);
    caller('speaking'); // 349.87: 1.1 s of the caller over Ferni
    wait(1100);
    caller('listening');
    expect(judge.wasTakenOver()).toBe(true);
    judge.onFalseInterruption(); // 355.3: resumed
    expect(judge.wasTakenOver()).toBe(false);
    caller('speaking'); // 355.36: another 1.0 s
    wait(1000);
    caller('listening');
    judge.onFalseInterruption(); // 358.4: resumed again
    judge.onItemAdded({ role: 'assistant', interrupted: false }); // played to the end
    expect(judge.wasTakenOver()).toBe(false);
  });

  it('is not fooled by a backchannel', () => {
    const { judge, wait, ferni, caller } = call();
    ferni('speaking');
    wait(2000);
    caller('speaking'); // "mm-hmm"
    wait(REAL_BARGE_IN_MS - 300);
    caller('listening');
    expect(judge.wasTakenOver()).toBe(false);
  });

  it('is not fooled by the caller going on as Ferni starts (split sentence, early reply)', () => {
    const { judge, wait, ferni, caller } = call();
    ferni('speaking'); // reply to "We don't get" starts...
    wait(COLLISION_MS - 200);
    caller('speaking'); // ..."caught up in reviews."
    wait(1500);
    ferni('listening');
    caller('listening');
    judge.onItemAdded({ role: 'assistant', interrupted: true });
    expect(judge.wasTakenOver()).toBe(false);
  });

  it('is not fooled by the caller still talking when Ferni starts', () => {
    const { judge, wait, ferni, caller } = call();
    caller('speaking');
    wait(300);
    ferni('speaking');
    wait(1500);
    caller('listening');
    expect(judge.wasTakenOver()).toBe(false);
  });

  it('recognizes a caller taking the floor', () => {
    const { judge, wait, ferni, caller } = call();
    ferni('speaking');
    wait(2500);
    caller('speaking'); // "Wait, hold on, that's not what I meant"
    wait(400);
    ferni('listening'); // LiveKit stops Ferni
    judge.onItemAdded({ role: 'assistant', interrupted: true });
    wait(REAL_BARGE_IN_MS);
    // Already true while the caller is still talking: a reply can be prepared early.
    expect(judge.wasTakenOver()).toBe(true);
    wait(1000);
    caller('listening');
    expect(judge.wasTakenOver()).toBe(true);
    ferni('speaking'); // the reply to it consumed the barge-in
    expect(judge.wasTakenOver()).toBe(false);
  });
});

async function opening(sessionId: string, wasInterrupted: boolean): Promise<string> {
  const input = new ReadableStream<string>({
    start(c) {
      c.enqueue('I hear you. ');
      c.enqueue('Tell me more.');
      c.close();
    },
  });
  const out = input.pipeThrough(
    createInterruptAwareTransform({
      wasInterrupted,
      interruptType: 'soft',
      personaId: 'ferni',
      sessionId,
    }) as never
  ) as unknown as AsyncIterable<string>;
  let text = '';
  for await (const chunk of out) text += chunk;
  return text;
}

describe('a Stage 2 breath/sigh lead before the first word', () => {
  const LEAD = 410; // a breath opening: 350 ms breath + 60 ms gap
  const START = 600; // caller starts 600 ms after Ferni's audio starts

  /** The caller talks for 1.2 s, starting START ms into Ferni's reply. */
  function overlapAt(lead: 'none' | 'before' | 'after'): boolean {
    const { judge, wait, ferni, caller } = call();
    if (lead === 'before') judge.onReplyLead(LEAD);
    ferni('speaking');
    if (lead === 'after') judge.onReplyLead(LEAD);
    wait(START);
    caller('speaking');
    wait(1200);
    caller('listening');
    return judge.wasTakenOver();
  }

  it("without a lead, speech 600 ms into Ferni's audio is a barge-in", () => {
    expect(START).toBeGreaterThanOrEqual(COLLISION_MS);
    expect(overlapAt('none')).toBe(true);
  });

  it('with a lead, the same speech is only 190 ms into her first word: a collision', () => {
    expect(START - LEAD).toBeLessThan(COLLISION_MS);
    expect(overlapAt('before')).toBe(false); // lead reported before playback began
    expect(overlapAt('after')).toBe(false); // lead reported once she was speaking
  });

  it('still catches a real barge-in after the first word', () => {
    const { judge, wait, ferni, caller } = call();
    judge.onReplyLead(LEAD);
    ferni('speaking');
    wait(LEAD + COLLISION_MS + 100);
    caller('speaking');
    wait(REAL_BARGE_IN_MS + 50);
    caller('listening');
    expect(judge.wasTakenOver()).toBe(true);
  });

  it('applies a lead once per reply, and never to the next one', () => {
    const { judge, wait, ferni, caller } = call();
    judge.onReplyLead(LEAD);
    ferni('speaking');
    judge.onReplyLead(LEAD); // a second report must not push the first word later still
    judge.onItemAdded({ role: 'assistant' });
    ferni('listening');
    judge.onReplyLead(LEAD); // a lead for a reply that never played...
    judge.onItemAdded({ role: 'assistant', interrupted: true });
    ferni('speaking'); // ...does not carry over to this one
    wait(START);
    caller('speaking');
    wait(1200);
    caller('listening');
    expect(judge.wasTakenOver()).toBe(true);
  });

  it('ignores leads that are not believable', () => {
    for (const bad of [0, -100, MAX_REPLY_LEAD_MS + 1, Number.NaN]) {
      const { judge, wait, ferni, caller } = call();
      judge.onReplyLead(bad);
      ferni('speaking');
      wait(START);
      caller('speaking');
      wait(1200);
      caller('listening');
      expect(judge.wasTakenOver()).toBe(true);
    }
  });

  it("noteReplyLead reaches the session's registered judge", () => {
    const judge = createBargeInJudge();
    const spy = vi.spyOn(judge, 'onReplyLead');
    const unregister = registerBargeInJudge('lead-session', judge);
    noteReplyLead('lead-session', LEAD);
    noteReplyLead('another-session', LEAD); // no judge: nothing to do
    unregister();
    noteReplyLead('lead-session', LEAD); // unregistered: ignored
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(LEAD);
  });
});

describe('the reply after an overlap (speech-wrapper.ts)', () => {
  const unregister: Array<() => void> = [];
  afterEach(() => {
    unregister.splice(0).forEach((f) => f());
    vi.restoreAllMocks();
  });

  it('opens plainly when the overlap was not a real barge-in', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // the "Oh—" would always fire
    const { judge, wait, ferni, caller } = call();
    unregister.push(registerBargeInJudge('judged-backchannel', judge));
    ferni('speaking');
    wait(2000);
    caller('speaking');
    wait(400);
    caller('listening');
    const text = await opening('judged-backchannel', true);
    expect(text.startsWith('I hear you.')).toBe(true);
    expect(text).not.toContain('Oh—');
    expect(text).not.toContain('<volume ratio="0.72"/>');
  });

  it('opens softly after a real barge-in', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { judge, wait, ferni, caller } = call();
    unregister.push(registerBargeInJudge('judged-barge-in', judge));
    ferni('speaking');
    wait(2000);
    caller('speaking');
    wait(1500);
    caller('listening');
    const text = await opening('judged-barge-in', true);
    expect(text.startsWith('<speed ratio="1.15"/><volume ratio="0.72"/>Oh—')).toBe(true);
  });

  it('keeps the old behavior for a session without a judge', () => {
    expect(softenAfterInterrupt('no-judge', true)).toBe(true);
    expect(softenAfterInterrupt('no-judge', false)).toBe(false);
  });
});
