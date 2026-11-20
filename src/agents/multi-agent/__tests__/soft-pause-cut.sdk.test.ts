/**
 * A reply cut while a soft pause holds it (#3857), through LiveKit's own audio forwarder
 * (performAudioForwarding) into the real resume buffer and the real patched room output.
 *
 * While the pause is open, the reply's forwarder waits inside captureFrame at the resume
 * buffer's closed gate. LiveKit cuts a reply by aborting that forwarder, waiting up to
 * REPLY_TASK_CANCEL_TIMEOUT (2 s) for it, and only then clearing the buffer
 * (agent_activity.js, the `speechHandle.interrupted` branch of the reply task, mirrored in
 * cut() below). The waiting frame can't see the abort, so the cut takes the whole 2 s.
 * SOFT_PAUSE_CUT_DROPS_HELD: the decision drops it unplayed (dropCutReply) and the cut ends
 * at once.
 */
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { initializeLogger, type voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResumeBufferOutput } from '../resume-buffer.js';
import { type RoomOutput, frame, roomOutput, sdkDist, sleep } from './sdk-room-output.js';

interface ForwardTask {
  result: Promise<void>;
}
const { performAudioForwarding } = (await import(join(sdkDist, 'generation.js'))) as {
  performAudioForwarding: (
    stream: ReadableStream<AudioFrame>,
    out: voice.AudioOutput,
    controller: AbortController,
    reconcilePlayoutPause: () => void
  ) => [ForwardTask, unknown];
};
const { REPLY_TASK_CANCEL_TIMEOUT } = (await import(join(sdkDist, 'speech_handle.js'))) as {
  REPLY_TASK_CANCEL_TIMEOUT: number;
};
const { cancelAndWait } = (await import(join(dirname(sdkDist), 'utils.js'))) as {
  cancelAndWait: (tasks: ForwardTask[], timeout: number) => Promise<void>;
};

const FRAME_MS = 20;

/** A reply of `replyMs` from a TTS faster than real time, forwarded by LiveKit's own forwarder. */
function speak(out: voice.AudioOutput, replyMs: number) {
  let sent = 0;
  const stream = new ReadableStream<AudioFrame>({
    async pull(c) {
      if (sent >= replyMs) return c.close();
      await sleep(1);
      sent += FRAME_MS;
      c.enqueue(frame(FRAME_MS));
    },
  });
  const [task] = performAudioForwarding(stream, out, new AbortController(), () => undefined);
  return task;
}

/** LiveKit's reply task once the speech is interrupted: cancel the forwarder, clear, wait. */
async function cut(out: voice.AudioOutput, task: ForwardTask) {
  await cancelAndWait([task], REPLY_TASK_CANCEL_TIMEOUT);
  out.clearBuffer();
  return out.waitForPlayout();
}

/**
 * How long after the decision LiveKit's reply task gets to its cut. The forwarder keeps
 * reading TTS frames meanwhile; none of them may reach the room.
 */
const REPLY_TASK_LAG_MS = 10;

/** The soft pause decides 'interrupted' (dropCutReply), then LiveKit's reply task cuts. */
async function dropThenCut(out: ResumeBufferOutput, task: ForwardTask) {
  out.dropCutReply();
  await sleep(REPLY_TASK_LAG_MS);
  return cut(out, task);
}

/** Ferni mid-reply when the soft pause stops him. */
async function pausedMidReply(driftGuard = false) {
  const room: RoomOutput = roomOutput();
  const out = new ResumeBufferOutput(room, {}, () => undefined, driftGuard);
  const task = speak(out, 3000);
  await sleep(400);
  out.pause();
  const sentAtPause = room.audioSource.framesSent;
  await sleep(300); // the confirmation window: words or the model decide
  return { room, out, task, sentAtPause };
}

beforeAll(() => {
  initializeLogger({ pretty: false, level: 'silent' });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a reply cut while a soft pause holds it', () => {
  it("without the drop, the cut waits out LiveKit's 2 s forwarder timeout (SOFT_PAUSE_ONE_OUTCOME alone)", async () => {
    vi.stubEnv('BARGE_IN_FAST_STOP', 'on');
    const { room, out, task, sentAtPause } = await pausedMidReply();
    const decidedAt = Date.now();
    const ev = await cut(out, task);
    expect(Date.now() - decidedAt).toBeGreaterThanOrEqual(REPLY_TASK_CANCEL_TIMEOUT - 20);
    expect(ev.interrupted).toBe(true);
    expect(room.audioSource.framesSent - sentAtPause).toBe(0);
  });

  it.each(['on', 'off'])(
    'with the drop, the cut ends within 50 ms and nothing more is heard (BARGE_IN_FAST_STOP=%s)',
    async (fastStop) => {
      vi.stubEnv('BARGE_IN_FAST_STOP', fastStop);
      const { room, out, task, sentAtPause } = await pausedMidReply();
      const decidedAt = Date.now();
      const ev = await dropThenCut(out, task);
      expect(Date.now() - decidedAt).toBeLessThanOrEqual(50);
      expect(ev.interrupted).toBe(true);
      expect(room.audioSource.framesSent - sentAtPause).toBe(0);
    }
  );

  it.each([false, true])(
    'the next reply plays in full and its playout is counted exactly (PLAYOUT_DRIFT_GUARD %s)',
    async (driftGuard) => {
      vi.stubEnv('BARGE_IN_FAST_STOP', 'on');
      const { room, out, task } = await pausedMidReply(driftGuard);
      await dropThenCut(out, task);
      expect(out.pendingPlayoutSegments).toBe(0);
      expect(room.pendingPlayoutSegments).toBe(0);
      out.resume(); // the next reply's playout launch resumes the output
      const heardBefore = room.audioSource.heardMs();
      await speak(out, 600).result;
      const ev = await out.waitForPlayout();
      expect(ev.interrupted).toBe(false);
      expect(Math.abs(ev.playbackPosition * 1000 - 600)).toBeLessThanOrEqual(FRAME_MS);
      expect(Math.abs(room.audioSource.heardMs() - heardBefore - 600)).toBeLessThanOrEqual(8);
      expect(out.pendingPlayoutSegments).toBe(0);
      expect(room.pendingPlayoutSegments).toBe(0);
    }
  );

  it('a pause that resumes (no words) still plays the whole reply, once', async () => {
    vi.stubEnv('BARGE_IN_FAST_STOP', 'on');
    const { room, out, task } = await pausedMidReply();
    out.resume();
    await task.result;
    const ev = await out.waitForPlayout();
    await room.audioSource.waitForPlayout();
    expect(ev.interrupted).toBe(false);
    expect(Math.abs(room.audioSource.heardMs() - 3000)).toBeLessThanOrEqual(8);
  });

  it('a drop with no pause open does nothing', async () => {
    const room = roomOutput();
    const out = new ResumeBufferOutput(room, {});
    const task = speak(out, 300);
    out.dropCutReply();
    await task.result;
    await out.waitForPlayout();
    await room.audioSource.waitForPlayout();
    expect(Math.abs(room.audioSource.heardMs() - 300)).toBeLessThanOrEqual(8);
  });
});
