/**
 * The 30s connect limit must actually cancel the attempt (abort the signal the
 * connection service closes its room on), and report a single timeout failure.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelConnectAttempt,
  connectWithTimeout,
  type Connectable,
} from '../../../src/app/call-connect.js';
import { connectFailure } from '../../../src/services/connect-failure.js';

afterEach(() => vi.useRealTimers());

function hangingService(): Connectable & { signal: AbortSignal | undefined } {
  const service = {
    signal: undefined as AbortSignal | undefined,
    connect: vi.fn(
      (options: { signal?: AbortSignal }) =>
        new Promise<boolean>((resolve) => {
          service.signal = options.signal;
          // Like the real service: an aborted attempt closes its room and resolves false.
          options.signal?.addEventListener('abort', () => resolve(false));
        })
    ),
    getLastFailure: () => connectFailure('cancelled'),
  };
  return service;
}

describe('connectWithTimeout', () => {
  it('aborts the in-flight attempt at the limit and reports a timeout', async () => {
    vi.useFakeTimers();
    const service = hangingService();

    const pending = connectWithTimeout(service, 30_000);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(service.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ ok: false, failure: connectFailure('timeout') });
    expect(service.signal?.aborted).toBe(true);
  });

  it('passes through the classified failure of a failed attempt', async () => {
    const service: Connectable = {
      connect: async () => false,
      getLastFailure: () => connectFailure('rate_limited'),
    };

    await expect(connectWithTimeout(service)).resolves.toEqual({
      ok: false,
      failure: connectFailure('rate_limited'),
    });
  });

  it('succeeds without aborting', async () => {
    let signal: AbortSignal | undefined;
    const service: Connectable = {
      connect: async (options) => {
        signal = options.signal;
        return true;
      },
      getLastFailure: () => null,
    };

    await expect(connectWithTimeout(service)).resolves.toEqual({ ok: true });
    expect(signal?.aborted).toBe(false);
  });

  it('lets the person cancel: aborts the attempt and reports cancelled, shown as nothing', async () => {
    const service = hangingService();
    service.getLastFailure = () => connectFailure('network');

    const pending = connectWithTimeout(service, 30_000);
    expect(cancelConnectAttempt()).toBe(true);

    await expect(pending).resolves.toEqual({ ok: false, failure: connectFailure('cancelled') });
    expect(service.signal?.aborted).toBe(true);
    expect(connectFailure('cancelled').action).toBe('none');
  });

  it('has nothing to cancel once the attempt is over', async () => {
    const service: Connectable = { connect: async () => true, getLastFailure: () => null };
    await connectWithTimeout(service);
    expect(cancelConnectAttempt()).toBe(false);
  });
});
