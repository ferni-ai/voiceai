/**
 * A call with any crisis read keeps nothing from then on: on by default, no flag, for the rest of
 * the call. The reads are services/safety's: crisis-call-risk.ts holds the call wherever it notes
 * risk (a pattern match, a classifier read that was not a clean none, a read with no verdict or
 * one that failed, a soft check-in, a crisis script that stood). This is the hold itself, a lower
 * layer, so every writer's existing check (minor-care.ts: memoryHeld, writeHeld, heldAfter)
 * refuses the write, and the call-end writes are skipped.
 *
 * Reads still in flight do not hold every writer: the classifier reads every turn. The capture
 * that queues deep extraction waits for the call's reads to settle (crisisReadsDone); the one
 * that can run before its turn's read (transcript-handler.ts) first waits for that read to start
 * (crisisTurnSettled), and captures nothing when none does (fail closed). Teardown and the
 * after-call tasks wait for the call's reads too. A live hold is never evicted.
 *
 * Not MINOR_CARE: no minor note, no hold on the caller's other calls, no purge of earlier memory.
 * The crisis_events record still writes (minor-care.ts careHeld).
 *
 * @module utils/crisis-memory-hold
 */
import { createLogger } from './safe-logger.js';
import { loggedScope, trimTwinFirst } from './twin-crisis-scope.js';

const log = createLogger({ module: 'crisis-memory-hold' });

/** Longer than any call plus its after-call work (minor-care.ts IDLE_MS). */
const HOLD_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
/** The turns of a call whose reads are remembered, newest last. */
const TURNS_KEPT = 16;
const POLL_MS = 100;

/** How long a capture waits for its turn's read to start, then for the call's reads to settle. */
export const CRISIS_READ_WAIT = { startMs: 5000, settleMs: 10_000 };

/** sessionId -> when it was held. Oldest first. */
const held = new Map<string, number>();
/** sessionId -> the turns a crisis read started for (crisisTurnKey). */
const seen = new Map<string, string[]>();
/** sessionId -> its reads still running. */
const reads = new Map<string, Set<Promise<void>>>();

/** One key for a turn's caller words, however the paths that read them spell them. */
export const crisisTurnKey = (words: string): string =>
  words
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const live = (at: number | undefined): boolean => at !== undefined && Date.now() - at <= HOLD_MS;

/**
 * Over the cap, only sessions that are not held go, oldest first, twin scopes before calls
 * (twin-crisis-scope.ts). The turn reads also keep at most TWIN_SCOPES_MAX twin scopes.
 */
function trim<V>(map: Map<string, V>, inserted: string, store: 'held' | 'seen'): void {
  const droppable = (id: string): boolean => !live(held.get(id));
  trimTwinFirst(map, { max: MAX_SESSIONS, inserted, droppable, capTwins: store === 'seen', store });
}

/** Hold this call's memory from now on. Never throws. */
export function holdForCrisis(sessionId: string | undefined): void {
  if (!sessionId || live(held.get(sessionId))) return;
  held.set(sessionId, Date.now());
  trim(held, sessionId, 'held');
  log.info(loggedScope(sessionId), 'Crisis memory hold');
}

/** A crisis read on this call has held its memory. */
export function crisisMemoryHeld(sessionId: string | undefined): boolean {
  return !!sessionId && live(held.get(sessionId));
}

/** The sessions a crisis read holds now: a copy (write-hold.ts, for writes naming no session). */
export function crisisHeldSessions(): string[] {
  return [...held].filter(([, at]) => live(at)).map(([id]) => id);
}

/** The sessions with a crisis read still running: a copy. */
export function crisisReadingSessions(): string[] {
  return [...reads].filter(([, running]) => running.size > 0).map(([id]) => id);
}

/** A crisis read of these caller words started on this call (the turn's pattern read). */
export function noteCrisisTurnRead(sessionId: string | undefined, words: string): void {
  if (!sessionId) return;
  const turns = (seen.get(sessionId) ?? []).concat(crisisTurnKey(words)).slice(-TURNS_KEPT);
  seen.delete(sessionId);
  seen.set(sessionId, turns);
  trim(seen, sessionId, 'seen');
}

/** A classifier read of these words starts: running until `end()`, which its reader calls. */
export function beginCrisisRead(sessionId: string, words: string): { end: () => void } {
  noteCrisisTurnRead(sessionId, words);
  let end: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    end = resolve;
  });
  const running = reads.get(sessionId) ?? new Set<Promise<void>>();
  running.add(done);
  reads.set(sessionId, running);
  return {
    end: () => {
      running.delete(done);
      if (running.size === 0 && reads.get(sessionId) === running) reads.delete(sessionId);
      end();
    },
  };
}

/** Settles when this call's running reads have (each is bounded); null when none is running. */
export function crisisReadsSettled(sessionId: string | undefined): Promise<void> | null {
  const running = sessionId ? reads.get(sessionId) : undefined;
  return running?.size ? Promise.all(running).then(() => undefined) : null;
}

const readOf = (sessionId: string, turn: string): boolean =>
  !!turn && !!seen.get(sessionId)?.some((t) => t === turn || t.includes(turn) || turn.includes(t));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * True when the call's running crisis reads have all settled (or none is running), so the hold
 * is up to date; false, logged, when they did not within `settleMs`: the call is held.
 */
export async function crisisReadsDone(sessionId: string, settleMs: number): Promise<boolean> {
  const running = crisisReadsSettled(sessionId);
  if (!running) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(resolve, settleMs, false);
  });
  const done = await Promise.race([running.then(() => true), late]).finally(() =>
    clearTimeout(timer)
  );
  if (!done) holdForCrisis(sessionId); // a read that never settled counts as risk
  return done || unread(sessionId, 'crisis reads did not settle');
}

/**
 * crisisReadsDone, once a crisis read of these words has started: for a capture that can run
 * before its turn's read (transcript-handler.ts). False when none started within `startMs`,
 * or when a settled read held the call.
 */
export async function crisisTurnSettled(
  sessionId: string | undefined,
  words: string,
  wait = CRISIS_READ_WAIT
): Promise<boolean> {
  if (!sessionId) return false;
  const turn = crisisTurnKey(words);
  for (let waited = 0; !readOf(sessionId, turn); waited += POLL_MS) {
    if (waited >= wait.startMs) return unread(sessionId, 'no crisis read of the turn');
    await sleep(POLL_MS);
  }
  if (!(await crisisReadsDone(sessionId, wait.settleMs))) return false;
  return !crisisMemoryHeld(sessionId) || unread(sessionId, 'a crisis read held the call');
}

function unread(sessionId: string, why: string): false {
  log.info({ ...loggedScope(sessionId), why }, 'Turn not captured: no settled crisis read');
  return false;
}

/** Tests only. */
export function resetCrisisMemoryHold(): void {
  held.clear();
  seen.clear();
  reads.clear();
}
