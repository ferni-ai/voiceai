import { AudioFrame } from '@livekit/rtc-node';
import {
  ReadableStream,
  type ReadableStreamDefaultController,
  type ReadableStreamDefaultReader,
} from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GUEST_QUEUE_FRAMES,
  MIX_SAMPLE_RATE,
  MIX_SAMPLES_PER_FRAME,
  RoomMixInput,
} from '../room-mix-input.js';
import { TalkerLedger } from '../talker-ledger.js';

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

/** Reads the next mixed frame, failing instead of hanging if none comes. */
async function nextFrame(reader: ReadableStreamDefaultReader<AudioFrame>): Promise<AudioFrame> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('no mixed frame within 200 ms')), 200);
  });
  const { value, done } = await Promise.race([reader.read(), timeout]);
  if (done || !value) throw new Error('mixed stream ended');
  return value;
}

function samplesOf(frame: AudioFrame): number[] {
  return Array.from(new Set(frame.data));
}

describe('RoomMixInput', () => {
  let input: RoomMixInput | undefined;
  afterEach(async () => {
    const open = input;
    input = undefined;
    await open?.close();
  });

  it('mixes the owner frame with the queued guest frame and notes both levels', async () => {
    const ledger = new TalkerLedger(OWNER);
    const note = vi.spyOn(ledger, 'note');
    input = new RoomMixInput(OWNER, ledger);
    const owner = fakeTrack();
    const guest = fakeTrack();
    input.addTrack(OWNER, owner.frames);
    input.addTrack(GUEST, guest.frames);
    const reader = input.stream.getReader();

    guest.push(700);
    await settle();
    owner.push(500);
    const mixed = await nextFrame(reader);

    expect(samplesOf(mixed)).toEqual([1200]);
    expect(mixed.samplesPerChannel).toBe(MIX_SAMPLES_PER_FRAME);
    expect(mixed.sampleRate).toBe(MIX_SAMPLE_RATE);
    expect(note).toHaveBeenCalledWith(OWNER, expect.any(Number), 500);
    expect(note).toHaveBeenCalledWith(GUEST, expect.any(Number), 700);
    expect(input.guests).toEqual([GUEST]);
    reader.releaseLock();
  });

  it('a stream that ends becomes silence', async () => {
    input = new RoomMixInput(OWNER, new TalkerLedger(OWNER));
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
    input = new RoomMixInput(OWNER, new TalkerLedger(OWNER));
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
    input = new RoomMixInput(OWNER, new TalkerLedger(OWNER));
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
    input = new RoomMixInput(OWNER, new TalkerLedger(OWNER));
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
    input = new RoomMixInput(OWNER, new TalkerLedger(OWNER));
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
    input = new RoomMixInput(OWNER, new TalkerLedger(OWNER));
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
