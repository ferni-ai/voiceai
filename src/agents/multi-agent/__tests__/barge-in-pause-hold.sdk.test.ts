/**
 * BARGE_IN_PAUSE_HOLD, on LiveKit's real (patched) room output with the real resume buffer in
 * front (as with NEVER_SILENT=on), and a caller whose speech state the test drives.
 *
 * Dev 2026-11-28, talk-over row: the barge-in model called 2 of 3 caller "mm-hm"s an
 * interruption after 0.02 s of overlap. LiveKit paused Ferni's reply, BARGE_IN_FAST_STOP cleared
 * the queued audio, and the verdict that it was a backchannel came ~1.7 s later: Ferni stopped
 * mid-sentence. With the flag on, that pause waits PAUSE_HOLD_MS and is applied only if the
 * caller is still speaking.
 *
 * Only the rtc AudioSource is a stand-in (sdk-room-output.ts).
 */
import { EventEmitter } from 'node:events';
import { initializeLogger, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cancelHoldOnBackchannel } from '../barge-in-soft-pause.js';
import { ResumeBufferOutput } from '../resume-buffer.js';
import { frame, roomOutput, sleep } from './sdk-room-output.js';

/** The session as the resume buffer sees it: a user state that changes, and says so. */
class Caller extends EventEmitter {
  constructor(public userState: string | undefined) {
    super();
  }
  now(state: string): void {
    this.userState = state;
    this.emit('user_state_changed', { newState: state });
  }
}

/** A reply of `replyMs` streamed into `out` the way LiveKit's forwarder does (100 ms frames, so a replay lands on frame edges). */
function speak(out: voice.AudioOutput, replyMs: number) {
  let cut = false;
  const done = (async () => {
    for (let ms = 0; ms < replyMs && !cut; ms += 100) await out.captureFrame(frame(100));
  })();
  const interrupt = async () => {
    cut = true;
    out.clearBuffer();
    out.resume();
    await done;
  };
  return { done, interrupt };
}

const PAUSE_HOLD_MS = ResumeBufferOutput.holdMs;

beforeAll(() => {
  initializeLogger({ pretty: false, level: 'silent' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Ferni mid-reply with a full queue; LiveKit pauses him for the caller's overlap. */
async function overlap(flag: 'on' | 'off', callerState: string | null = 'speaking') {
  vi.stubEnv('BARGE_IN_PAUSE_HOLD', flag);
  vi.stubEnv('BARGE_IN_FAST_STOP', 'on');
  const room = roomOutput();
  const caller = new Caller(callerState ?? undefined);
  const logs: Array<Record<string, unknown>> = [];
  const out = new ResumeBufferOutput(room, caller, (f) => logs.push({ ...f, at: Date.now() }));
  const clears = vi.spyOn(room.audioSource, 'clearQueue');
  const startedAt = Date.now();
  const reply = speak(out, 2000);
  await sleep(830); // the queue is full
  const pausedAt = Date.now();
  out.pause(); // LiveKit: the barge-in model said interruption
  const sentSince = room.audioSource.framesSent;
  return {
    room,
    out,
    caller,
    logs,
    clears,
    reply,
    startedAt,
    pausedAt,
    /** Frames the reply sent to the room since the pause: none while the pause is applied. */
    framesSincePause: () => room.audioSource.framesSent - sentSince,
    paused: () => logs.some((l) => l.event === 'paused'),
    /** Ms from LiveKit's pause call until the pause took hold (the gate closed). */
    stoppedAfterMs: () => Number(logs.find((l) => l.event === 'paused')?.at) - pausedAt,
  };
}

describe('BARGE_IN_PAUSE_HOLD', () => {
  it('off: the pause is applied at once and the queued audio cleared, as on main', async () => {
    const t = await overlap('off');
    await sleep(100);
    expect(t.paused()).toBe(true);
    expect(t.framesSincePause()).toBe(0);
    expect(t.room.audioSource.audibleUntil - t.pausedAt).toBeLessThanOrEqual(20);
    await t.reply.interrupt();
  });

  it('on: a backchannel that ends before the hold does is never paused; the reply plays straight through', async () => {
    const t = await overlap('on');
    await sleep(300); // "mm-hm" is over
    t.caller.now('listening');
    await sleep(PAUSE_HOLD_MS); // past the hold
    t.out.resume(); // LiveKit's own resume, much later
    await t.reply.done;
    await t.room.audioSource.waitForPlayout();
    expect(t.paused()).toBe(false);
    expect(t.clears).not.toHaveBeenCalled(); // nothing was cut either
    expect(t.logs.find((l) => l.event === 'pause_hold_ended')).toMatchObject({ why: 'quiet' });
    expect(Math.abs(t.room.audioSource.heardMs() - 2000)).toBeLessThanOrEqual(8);
    // no gap: the 2 s reply ends ~2 s after it began
    expect(t.room.audioSource.audibleUntil - t.startedAt).toBeLessThan(2000 + 150);
  });

  it('on: a caller still speaking when the hold ends has the pause applied, and the reply resumes whole', async () => {
    const t = await overlap('on');
    await sleep(PAUSE_HOLD_MS - 150);
    expect(t.paused()).toBe(false);
    expect(t.framesSincePause()).toBeGreaterThan(0); // still playing during the hold
    await sleep(300); // the hold has ended
    expect(t.paused()).toBe(true);
    expect(t.logs.find((l) => l.event === 'pause_hold_ended')).toMatchObject({ why: 'applied' });
    // a real interruption stops Ferni PAUSE_HOLD_MS after LiveKit's pause, give or take a frame
    expect(t.stoppedAfterMs()).toBeGreaterThanOrEqual(PAUSE_HOLD_MS - 10);
    expect(t.stoppedAfterMs()).toBeLessThanOrEqual(PAUSE_HOLD_MS + 100);
    const sent = t.framesSincePause();
    await sleep(100);
    expect(t.framesSincePause()).toBe(sent); // held again at the gate
    t.out.resume();
    await t.reply.done;
    await t.room.audioSource.waitForPlayout();
    expect(Math.abs(t.room.audioSource.heardMs() - 2000)).toBeLessThanOrEqual(8);
  });

  it("on: LiveKit's resume before the hold ends cancels it", async () => {
    const t = await overlap('on');
    await sleep(200);
    t.out.resume();
    await sleep(PAUSE_HOLD_MS); // the caller is still speaking, but the pause is gone
    expect(t.paused()).toBe(false);
    expect(t.logs.find((l) => l.event === 'pause_hold_ended')).toMatchObject({ why: 'resumed' });
    await t.reply.interrupt();
  });

  it('on: a caller who goes quiet and speaks again inside the hold is a new overlap: the pause is not applied', async () => {
    const t = await overlap('on');
    await sleep(150);
    t.caller.now('listening'); // the "mm-hm" is over: the hold ends here
    await sleep(100);
    t.caller.now('speaking'); // and they say something else, before the hold would have ended
    await sleep(PAUSE_HOLD_MS);
    expect(t.paused()).toBe(false);
    expect(t.logs.find((l) => l.event === 'pause_hold_ended')).toMatchObject({ why: 'quiet' });
    await t.reply.interrupt();
  });

  it('on: a verdict to cut (clearBuffer) before the hold ends ends the hold; nothing is paused after', async () => {
    const t = await overlap('on');
    await sleep(200);
    await t.reply.interrupt(); // clearBuffer + resume
    await sleep(PAUSE_HOLD_MS);
    expect(t.paused()).toBe(false);
    expect(t.logs.find((l) => l.event === 'pause_hold_ended')).toMatchObject({
      why: 'interrupted',
    });
  });

  it('on: a verdict that it is a backchannel ends the hold for good: no pause, no clear, no replay', async () => {
    const t = await overlap('on');
    await sleep(200);
    t.out.cancelHold(); // the barge-in model: backchannel; the caller is still speaking
    await sleep(PAUSE_HOLD_MS + 100);
    t.caller.now('listening');
    await t.reply.done;
    await t.room.audioSource.waitForPlayout();
    expect(t.paused()).toBe(false);
    expect(t.clears).not.toHaveBeenCalled();
    expect(t.logs.find((l) => l.event === 'pause_hold_ended')).toMatchObject({
      why: 'backchannel',
    });
    expect(Math.abs(t.room.audioSource.heardMs() - 2000)).toBeLessThanOrEqual(8);
    expect(t.room.audioSource.audibleUntil - t.startedAt).toBeLessThan(2000 + 150);
  });

  it("on: the live call's verdict hook cancels the hold on isInterruption false, and only then", async () => {
    const t = await overlap('on');
    const session = Object.assign(new EventEmitter(), { output: { audio: t.out } });
    cancelHoldOnBackchannel({
      session,
      sessionWithEvents: session,
      sessionEventHandlers: [],
    } as never);
    const verdict = voice.AgentSessionEventTypes.OverlappingSpeech;
    session.emit(verdict, { isInterruption: true });
    await sleep(50);
    expect(t.logs.some((l) => l.event === 'pause_hold_ended')).toBe(false); // still held
    session.emit(verdict, { isInterruption: false });
    expect(t.logs.find((l) => l.event === 'pause_hold_ended')).toMatchObject({
      why: 'backchannel',
    });
    await sleep(PAUSE_HOLD_MS);
    expect(t.paused()).toBe(false);
    await t.reply.interrupt();
  });

  it("on: the soft pause's own pause (pauseNow) is never held", async () => {
    const t = await overlap('on');
    t.out.pauseNow(); // sustained speech: the fast path decided
    await sleep(100);
    expect(t.paused()).toBe(true);
    expect(t.framesSincePause()).toBe(0);
    expect(t.room.audioSource.audibleUntil - t.pausedAt).toBeLessThanOrEqual(20);
    await t.reply.interrupt();
  });

  it.each([['listening'], [null]])(
    'on: a pause with no overlap to wait on (caller state %s, null = unknown) is applied at once, as on main',
    async (state) => {
      const t = await overlap('on', state);
      await sleep(100);
      expect(t.paused()).toBe(true);
      expect(t.framesSincePause()).toBe(0);
      await t.reply.interrupt();
    }
  );
});
