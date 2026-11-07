/**
 * Call Connect
 *
 * Runs one connect attempt with a hard time limit. When the limit hits, the
 * attempt is actually cancelled (the room is closed), not just abandoned while
 * it keeps connecting in the background.
 */

import { connectFailure, type ConnectFailure } from '../services/connect-failure.js';

export const CONNECT_TIMEOUT_MS = 30_000;

export interface Connectable {
  connect(options: { signal?: AbortSignal; tapAt?: number }): Promise<boolean>;
  getLastFailure(): ConnectFailure | null;
}

export type ConnectOutcome = { ok: true } | { ok: false; failure: ConnectFailure };

/** The attempt in progress, so the person can call it off. */
let current: { cancel: () => void } | null = null;

/** Cancel the connect attempt in progress. Returns false when there is none. */
export function cancelConnectAttempt(): boolean {
  if (!current) return false;
  current.cancel();
  return true;
}

/** `tapAt` (performance.now()) is the start-call tap, passed on for the call-start timing. */
export async function connectWithTimeout(
  service: Connectable,
  { timeoutMs = CONNECT_TIMEOUT_MS, tapAt }: { timeoutMs?: number; tapAt?: number } = {}
): Promise<ConnectOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const attempt = {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
  current = attempt;

  try {
    const ok = await service.connect({ signal: controller.signal, tapAt });
    if (cancelled) return { ok: false, failure: connectFailure('cancelled') };
    if (ok) return { ok: true };
    if (timedOut) return { ok: false, failure: connectFailure('timeout') };
    return { ok: false, failure: service.getLastFailure() ?? connectFailure('unknown') };
  } finally {
    clearTimeout(timer);
    if (current === attempt) current = null;
  }
}
