import { AudioFrame } from '@livekit/rtc-node';
import {
  ReadableStream,
  type ReadableStreamDefaultController,
  type ReadableStreamDefaultReader,
} from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIX_SAMPLE_RATE, RoomMixInput } from '../room-mix-input.js';
import { TalkerLedger } from '../talker-ledger.js';

/** The mix's frame (10 ms at 16 kHz) and guest queue (50 ms), from the plan. */
const MIX_SAMPLES_PER_FRAME = 160;
const GUEST_QUEUE_FRAMES = 5;

const OWNER = 'owner_web';
const GUEST = 'guest_call1';

function frameOf(value: number): AudioFrame {
  const data = new Int16Array(MIX_SAMPLES_PER_FRAME).fill(value);
  return new AudioFrame(data, MIX_SAMPLE_RATE, 1, MIX_SAMPLES_PER_FRAME);
}

/** A track we can push frames into and end, like an `AudioStream` from the SDK. */
function fakeTrack() {
  let controller: ReadableStreamDefaultController<AudioFrame> | undefined;
  const state = { cancelled: false };
  const frames = new ReadableStream<AudioFrame>({
    start: (c) => {
      controller = c;
    },
    cancel: () => {
      state.cancelled = true;
    },
  });
  return {
    frames,
    state,
    push: (value: number) => controller?.enqueue(frameOf(value)),
    pushFrame: (frame: AudioFrame) => controller?.enqueue(frame),
    end: () => controller?.close(),
  };
}

/** Lets the input's track readers take what has been pushed. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop -- each turn lets one more pending read run
    await nextTick();
  }
}

/** Waits for a mixed frame, failing instead of hanging if none comes. */
async function within(read: Promise<{ done: boolean; value?: AudioFrame }>): Promise<AudioFrame> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('no mixed frame within 200 ms')), 200);
  });
  const { value, done } = await Promise.race([read, timeout]);
  if (done || !value) throw new Error('mixed stream ended');
  return value;
}

/** Reads the next mixed frame, failing instead of hanging if none comes. */
function nextFrame(reader: ReadableStreamDefaultReader<AudioFrame>): Promise<AudioFrame> {
  return within(reader.read());
}

function samplesOf(frame: AudioFrame): number[] {
  return Array.from(new Set(frame.data));
}

describe('RoomMixInput', () => {
  let input: RoomMixInput | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    const open = input;
    input = undefined;
    await open?.close();
  });

  it('mixes the owner frame with the queued guest frame and notes both levels', async () => {
    const ledger = new TalkerLedger(OWNER);
    const note = vi.spyOn(ledger, 'note');
    input = new RoomMixInput(ledger);
    const owner = fakeTrack();
    const guest = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    input.addTrack(GUEST, guest.frames);
    const reader = input.stream.getReader();

    guest.push(700);
    await settle();
    vi.spyOn(performance, 'now').mockReturnValue(4242);
    owner.push(500);
    const mixed = await nextFrame(reader);

    expect(samplesOf(mixed)).toEqual([1200]);
    expect(mixed.samplesPerChannel).toBe(MIX_SAMPLES_PER_FRAME);
    expect(mixed.sampleRate).toBe(MIX_SAMPLE_RATE);
    // Notes are stamped with the monotonic mix clock, which Task 2 reads too.
    expect(note).toHaveBeenCalledWith(OWNER, 4242, 500);
    expect(note).toHaveBeenCalledWith(GUEST, 4242, 700);
    expect(input.guests).toEqual([GUEST]);
    reader.releaseLock();
  });

  it('takes the owner from the ledger: only their track clocks the mix', async () => {
    input = new RoomMixInput(new TalkerLedger(OWNER));
    const guest = fakeTrack();
    input.addTrack(GUEST, guest.frames);
    const reader = input.stream.getReader();
    let emitted = false;
    const pending = reader.read().then((result) => {
      emitted = true;
      return result;
    });
    guest.push(700);
    await settle();
    expect(emitted).toBe(false); // a guest frame alone never clocks the mix
    expect(input.guests).toEqual([GUEST]);

    const owner = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    owner.push(500);
    expect(samplesOf(await within(pending))).toEqual([1200]);
    expect(input.guests).toEqual([GUEST]);
    reader.releaseLock();
  });

  it.each([
    ['80 samples', new AudioFrame(new Int16Array(80).fill(700), MIX_SAMPLE_RATE, 1, 80)],
    [
      'the wrong sample rate',
      new AudioFrame(
        new Int16Array(MIX_SAMPLES_PER_FRAME).fill(700),
        8000,
        1,
        MIX_SAMPLES_PER_FRAME
      ),
    ],
    [
      'two channels',
      new AudioFrame(
        new Int16Array(MIX_SAMPLES_PER_FRAME).fill(700),
        MIX_SAMPLE_RATE,
        2,
        MIX_SAMPLES_PER_FRAME / 2
      ),
    ],
  ])('a guest frame of %s is mixed as silence', async (_label, badFrame) => {
    const ledger = new TalkerLedger(OWNER);
    const note = vi.spyOn(ledger, 'note');
    input = new RoomMixInput(ledger);
    const owner = fakeTrack();
    const guest = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    input.addTrack(GUEST, guest.frames);
    const reader = input.stream.getReader();

    guest.pushFrame(badFrame);
    await settle();
    owner.push(500);
    const mixed = await nextFrame(reader);

    expect(samplesOf(mixed)).toEqual([500]);
    expect(mixed.samplesPerChannel).toBe(MIX_SAMPLES_PER_FRAME);
    expect(note).toHaveBeenCalledWith(GUEST, expect.any(Number), 0);
    reader.releaseLock();
  });

  it('a stream that ends becomes silence', async () => {
    input = new RoomMixInput(new TalkerLedger(OWNER));
    const owner = fakeTrack();
    const guest = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    input.addTrack(GUEST, guest.frames);
    const reader = input.stream.getReader();

    guest.push(700);
    guest.end();
    await settle();
    expect(input.guests).toEqual([]);

    owner.push(500);
    expect(samplesOf(await nextFrame(reader))).toEqual([500]);
    owner.push(500);
    expect(samplesOf(await nextFrame(reader))).toEqual([500]);
    reader.releaseLock();
  });

  it('a slow guest never delays the owner', async () => {
    input = new RoomMixInput(new TalkerLedger(OWNER));
    const owner = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    input.addTrack(GUEST, fakeTrack().frames);
    const reader = input.stream.getReader();

    owner.push(500);
    expect(samplesOf(await nextFrame(reader))).toEqual([500]);
    expect(input.guests).toEqual([GUEST]);
    reader.releaseLock();
  });

  it('keeps at most GUEST_QUEUE_FRAMES guest frames, dropping the oldest', async () => {
    input = new RoomMixInput(new TalkerLedger(OWNER));
    const owner = fakeTrack();
    const guest = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    input.addTrack(GUEST, guest.frames);
    const reader = input.stream.getReader();

    for (let i = 1; i <= GUEST_QUEUE_FRAMES + 2; i++) guest.push(i * 100);
    await settle();

    const heard: number[] = [];
    for (let i = 0; i < GUEST_QUEUE_FRAMES + 1; i++) {
      owner.push(0);
      // eslint-disable-next-line no-await-in-loop -- one owner frame in, one mixed frame out
      heard.push(...samplesOf(await nextFrame(reader)));
    }
    // Frames 100 and 200 were dropped; the last owner frame finds the queue empty.
    expect(heard).toEqual([300, 400, 500, 600, 700, 0]);
    reader.releaseLock();
  });

  it('removeTrack takes the guest out of the mix', async () => {
    input = new RoomMixInput(new TalkerLedger(OWNER));
    const owner = fakeTrack();
    const guest = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    input.addTrack(GUEST, guest.frames);
    const reader = input.stream.getReader();

    guest.push(700);
    await settle();
    input.removeTrack(GUEST);
    expect(input.guests).toEqual([]);

    owner.push(500);
    expect(samplesOf(await nextFrame(reader))).toEqual([500]);
    reader.releaseLock();
  });

  it('a re-added owner track keeps driving the mix', async () => {
    input = new RoomMixInput(new TalkerLedger(OWNER));
    const first = fakeTrack();
    input.addTrack(OWNER, first.frames);
    const reader = input.stream.getReader();
    first.push(100);
    expect(samplesOf(await nextFrame(reader))).toEqual([100]);

    const second = fakeTrack();
    input.addTrack(OWNER, second.frames);
    await settle();
    expect(first.state.cancelled).toBe(true);
    second.push(200);
    expect(samplesOf(await nextFrame(reader))).toEqual([200]);
    reader.releaseLock();
  });

  it('emits nothing while detached and resumes when attached again', async () => {
    input = new RoomMixInput(new TalkerLedger(OWNER));
    const owner = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    const reader = input.stream.getReader();

    input.setAttached(false);
    owner.push(111);
    await settle();
    input.setAttached(true);
    owner.push(222);
    expect(samplesOf(await nextFrame(reader))).toEqual([222]);
    reader.releaseLock();
  });
});
