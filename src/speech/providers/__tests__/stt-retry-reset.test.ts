/**
 * The patched SDK SpeechStream (patches/@livekit__agents@1.5.1.patch, STT_RETRY_RESET):
 * a connection that stayed up 30 s starts a fresh retry count when it drops.
 *
 * Prod 2026-10-13: Cartesia closed the STT socket every ~5 min (code 1006). The SDK counted
 * every reconnect against maxRetry (3) for the whole call, so the 4th routine reconnect,
 * 20 minutes in, ended the session and left the caller alone in the room.
 */
import { APIConnectionError, stt } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeSTT extends stt.STT {
  label = 'fake-stt';
  constructor() {
    super({ streaming: true, interimResults: true });
  }
  async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('not used');
  }
  stream(): stt.SpeechStream {
    throw new Error('not used');
  }
}

/** Each run() lasts `upMs` (on the fake clock), then drops; `drops` times, then ends cleanly. */
// @ts-expect-error mainTask is private in the SDK typings; overriding it is how the test catches its final throw.
class DroppingStream extends stt.SpeechStream {
  label = 'fake-stt';
  runs = 0;
  readonly errors: Array<{ recoverable: boolean }> = [];
  readonly done: Promise<void>;
  private finished!: () => void;
  constructor(
    sttImpl: FakeSTT,
    private readonly upMs: number,
    private readonly drops: number
  ) {
    super(sttImpl, 16000, { maxRetry: 3, retryIntervalMs: 0, timeoutMs: 1000 });
    this.done = new Promise((resolve) => (this.finished = resolve));
    sttImpl.on('error', (e: { recoverable: boolean }) => {
      this.errors.push(e);
      if (!e.recoverable) this.finished();
    });
  }
  /** The SDK's own retry loop, its final give-up throw caught (the SDK leaves it unhandled). */
  async mainTask(): Promise<void> {
    const sdk = stt.SpeechStream.prototype as unknown as { mainTask(this: unknown): Promise<void> };
    await sdk.mainTask.call(this).catch(() => undefined);
  }
  protected async run(): Promise<void> {
    this.runs += 1;
    vi.setSystemTime(Date.now() + this.upMs);
    if (this.runs <= this.drops) {
      throw new APIConnectionError({
        message: 'Cartesia STT connection closed unexpectedly (code=1006)',
        options: { retryable: true },
      });
    }
    this.finished(); // a clean end
  }
}

/** Runs the SDK's own retry loop (started by the SpeechStream constructor) to its end. */
async function finish(upMs: number, drops: number) {
  const stream = new DroppingStream(new FakeSTT(), upMs, drops);
  await stream.done;
  stream.close();
  return { fatal: stream.errors.some((e) => !e.recoverable), runs: stream.runs };
}

describe('STT retry count (STT_RETRY_RESET)', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.STT_RETRY_RESET;
  });

  it('survives routine drops of a connection that stays up 5 minutes each time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // six 5-minute drops: a 30-minute call
    expect(await finish(5 * 60_000, 6)).toEqual({ fatal: false, runs: 7 });
  });

  it('still gives up on a connection that keeps failing at once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(await finish(100, 6)).toEqual({ fatal: true, runs: 4 }); // maxRetry 3 + 1
  });

  it('with STT_RETRY_RESET=off keeps the SDK behaviour: the 4th drop ends the call', async () => {
    process.env.STT_RETRY_RESET = 'off';
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(await finish(5 * 60_000, 6)).toEqual({ fatal: true, runs: 4 });
  });
});
