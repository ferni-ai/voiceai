/**
 * The SDK's SpeechStream retry loop: when an STT connection drops, does the retry count
 * start over, or does the call end after maxRetry (3) more failures?
 *
 * Prod 2026-10-13: Cartesia closed the STT socket every ~5 min (code 1006). The SDK counted
 * every reconnect against maxRetry for the whole call, so the 4th routine reconnect, 20
 * minutes in, ended the session. 1.7.1 (#2352) resets the count on a final transcript only,
 * which a quiet caller never sends; these drops carry no transcript.
 *
 * 1.9.1 (#2494) resets the count after any attempt that lasted longer than the connect
 * timeout (10 s by default, timed from before run()). That fixes the quiet caller but is
 * looser than our old 30 s patch: a socket the provider accepts and closes 11-29 s later
 * (quota, concurrency, auth), or a connect that hangs ~10 s, retries forever at attempt 1,
 * and the caller is left with a deaf agent and no alert. Our patch (STT_RETRY_MIN_UPTIME,
 * patches/@livekit__agents@1.9.3.patch, on by default) resets only after 60 s up.
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

/**
 * Each run() lasts `upMs` (on the fake clock), then drops; `drops` times, then ends cleanly.
 * The connect options are the SDK defaults (maxRetry 3, timeoutMs 10 s), without the wait.
 */
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
    super(sttImpl, 16000, { maxRetry: 3, retryIntervalMs: 0, timeoutMs: 10_000 });
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

const FIVE_MINUTES = 5 * 60_000;
const JUST_PAST_TIMEOUT = 10_500;

describe('STT retry count across reconnects', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.STT_RETRY_MIN_UPTIME;
  });

  it('survives routine drops of a connection that stays up 5 minutes each time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // six 5-minute drops: a 30-minute call
    expect(await finish(FIVE_MINUTES, 6)).toEqual({ fatal: false, runs: 7 });
  });

  it('still gives up on a connection that keeps failing at once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(await finish(100, 6)).toEqual({ fatal: true, runs: 4 }); // maxRetry 3 + 1
  });

  it('gives up on a connection that keeps dropping 10.5 s in (STT_RETRY_MIN_UPTIME)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(await finish(JUST_PAST_TIMEOUT, 20)).toEqual({ fatal: true, runs: 4 });
  });

  it('with STT_RETRY_MIN_UPTIME=off (stock 1.9.3) retries 10.5 s drops without limit', async () => {
    process.env.STT_RETRY_MIN_UPTIME = 'off';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 20 drops, each reset to attempt 1: it never reaches maxRetry, and only ends because the
    // fake provider stops dropping. In a call it would retry for as long as the room lasts.
    expect(await finish(JUST_PAST_TIMEOUT, 20)).toEqual({ fatal: false, runs: 21 });
  });

  it('with STT_RETRY_MIN_UPTIME=off still resets after 5 minutes up', async () => {
    process.env.STT_RETRY_MIN_UPTIME = 'off';
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(await finish(FIVE_MINUTES, 6)).toEqual({ fatal: false, runs: 7 });
  });
});
