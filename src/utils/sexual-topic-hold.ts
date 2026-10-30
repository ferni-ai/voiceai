/**
 * SEXUAL_TOPIC_BOUNDARY=on (off by default): a call whose caller turned to a sexual topic, while
 * not a verified account owner or with any sign of being under 18, keeps nothing from then on.
 * The read that sets the hold is in agents/personas/sexual-boundary.ts; this is the hold itself,
 * a lower layer, so every writer's existing check (minor-care.ts: memoryHeld, userHeld,
 * writeHeld, heldAfter) refuses the write, and the after-call tasks are skipped.
 *
 * A session with a read still running is held too, until it settles: a writer that runs before
 * the read can't tell, so it fails closed. A live hold is never evicted.
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

/** Never a placeholder id ('anonymous', 'default'): one bucket for many callers. */
const own = (userId: string | undefined): string | undefined =>
  userId?.trim() && !PLACEHOLDER_IDS.has(userId.trim().toLowerCase()) ? userId : undefined;

/** Hold this session's memory from now on. Once per session; never throws. */
export function holdForSexualTopic(sessionId: string | undefined, userId?: string): void {
  if (!sessionId) return;
  const known = held.get(sessionId);
  held.set(sessionId, { at: known?.at ?? Date.now(), userId: own(userId) ?? known?.userId });
  if (known) return;
  // Over the cap, only expired holds go, oldest first. A live one never does: it stays held.
  for (const [id, entry] of held) {
    if (held.size <= MAX_SESSIONS) break;
    if (!live(entry)) held.delete(id);
  }
  log.info({ sessionId }, 'SEXUAL_TOPIC_BOUNDARY memory held');
}

const live = (entry: { at: number } | undefined): boolean =>
  !!entry && Date.now() - entry.at <= HOLD_MS;

/** A turn of this session was read as sexual (flag on): the note's check. */
export function sexualTopicConfirmed(
  sessionId: string | undefined,
  env: Env = process.env
): boolean {
  return !!sessionId && sexualBoundaryOn(env) && live(held.get(sessionId));
}

/** This session's memory is held (flag on): read as sexual, or a read still running. */
export function sexualTopicHeld(sessionId: string | undefined, env: Env = process.env): boolean {
  return sexualTopicConfirmed(sessionId, env) || (!!sessionId && !!reads.get(sessionId)?.size);
}

/** Any session of this user is held or being read (flag on): the per-user writers' check. */
export function sexualTopicUserHeld(userId: string | undefined, env: Env = process.env): boolean {
  if (!userId || !sexualBoundaryOn(env)) return false;
  for (const entry of held.values()) if (entry.userId === userId && live(entry)) return true;
  for (const running of reads.values())
    for (const read of running) if (read.userId === userId) return true;
  return false;
}

interface Read {
  userId?: string;
  done: Promise<void>;
}
/** sessionId -> its reads still running (sexual-boundary.ts): held until they settle. */
const reads = new Map<string, Set<Read>>();

/** A read of this session's turn starts: held until `end()`, which the reader always calls. */
export function beginSexualRead(sessionId: string, userId?: string): { end: () => void } {
  let settle: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const read: Read = { userId: own(userId), done };
  const running = reads.get(sessionId) ?? new Set<Read>();
  running.add(read);
  reads.set(sessionId, running);
  return {
    end: () => {
      running.delete(read);
      if (running.size === 0 && reads.get(sessionId) === running) reads.delete(sessionId);
      settle();
    },
  };
}

/** Settles when this session's running reads have (each is bounded); null when none is running. */
export function sexualReadsSettled(sessionId: string | undefined): Promise<void> | null {
  const running = sessionId ? reads.get(sessionId) : undefined;
  if (!running?.size) return null;
  return Promise.all([...running].map((read) => read.done)).then(() => undefined);
}

/** Tests only. */
export function resetSexualTopicHold(): void {
  held.clear();
  reads.clear();
}
