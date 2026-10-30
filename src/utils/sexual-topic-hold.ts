/**
 * SEXUAL_TOPIC_BOUNDARY=on (off by default): a call whose caller turned to a sexual topic, while
 * not a verified account owner or with any sign of being under 18, keeps nothing from then on.
 * The read that sets the hold is in agents/personas/sexual-boundary.ts; this is the hold itself,
 * a lower layer, so every writer's existing check (minor-care.ts: memoryHeld, userHeld,
 * writeHeld, heldAfter) refuses the write, and the after-call tasks are skipped.
 *
 * Not MINOR_CARE: nothing here says the caller is a minor. No minor note, no shared hold on the
 * caller's number, no purge of their earlier memory.
 *
 * @module utils/sexual-topic-hold
 */
import { flagOn } from '../config/env-flag.js';
import { createLogger } from './safe-logger.js';
import { PLACEHOLDER_IDS } from './synthetic-user.js';

const log = createLogger({ module: 'sexual-topic-hold' });

type Env = Record<string, string | undefined>;

/** Longer than any call plus its after-call work (minor-care.ts IDLE_MS). */
const HOLD_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;

/** sessionId -> when it was held, and the caller's userId if known. Oldest first. */
const held = new Map<string, { at: number; userId?: string }>();

export function sexualBoundaryOn(env: Env = process.env): boolean {
  return flagOn('SEXUAL_TOPIC_BOUNDARY', env);
}

/** Hold this session's memory from now on. Once per session; never throws. */
export function holdForSexualTopic(sessionId: string | undefined, userId?: string): void {
  if (!sessionId) return;
  const known = held.get(sessionId);
  // Never a placeholder id ('anonymous', 'default'): one bucket for many callers.
  const own =
    userId?.trim() && !PLACEHOLDER_IDS.has(userId.trim().toLowerCase()) ? userId : undefined;
  held.set(sessionId, { at: known?.at ?? Date.now(), userId: own ?? known?.userId });
  if (known) return;
  if (held.size > MAX_SESSIONS) held.delete(held.keys().next().value!);
  log.info({ sessionId }, 'SEXUAL_TOPIC_BOUNDARY memory held');
}

const live = (entry: { at: number } | undefined): boolean =>
  !!entry && Date.now() - entry.at <= HOLD_MS;

/** This session is held for a sexual topic (flag on). */
export function sexualTopicHeld(sessionId: string | undefined, env: Env = process.env): boolean {
  return !!sessionId && sexualBoundaryOn(env) && live(held.get(sessionId));
}

/** Any live session of this user is held (flag on): the per-user writers' timer check. */
export function sexualTopicUserHeld(userId: string | undefined, env: Env = process.env): boolean {
  if (!userId || !sexualBoundaryOn(env)) return false;
  for (const entry of held.values()) if (entry.userId === userId && live(entry)) return true;
  return false;
}

/** sessionId -> its reads still running (sexual-boundary.ts), so call-end work can wait for them. */
const reads = new Map<string, Set<Promise<unknown>>>();

/** A read of this session's turn is running: call-end writers wait for it (readsSettled). */
export function trackSexualRead(sessionId: string, read: Promise<unknown>): void {
  const running = reads.get(sessionId) ?? new Set();
  running.add(read);
  reads.set(sessionId, running);
  void read
    .catch(() => undefined)
    .finally(() => {
      running.delete(read);
      if (running.size === 0 && reads.get(sessionId) === running) reads.delete(sessionId);
    });
}

/** Settles when this session's running reads have (each is bounded); null when none is running. */
export function sexualReadsSettled(sessionId: string | undefined): Promise<void> | null {
  const running = sessionId ? reads.get(sessionId) : undefined;
  if (!running?.size) return null;
  return Promise.allSettled([...running]).then(() => undefined);
}

/** Tests only. */
export function resetSexualTopicHold(): void {
  held.clear();
  reads.clear();
}
