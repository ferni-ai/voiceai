/**
 * One owner-keyed answer to "may this write land?", for a single write gate to ask later. Nothing
 * calls writeHold yet: today every writer asks minor-care.ts (writeHeld, careHeld) at its own call
 * site, and this module changes none of them.
 *
 * A write names its owner; it often names no session (a flush timer, the after-call work). It
 * composes the existing holds rather than restating them, and is never more open than they are:
 *
 * - content: held wherever writeHeld is (placeholder ids included). A write that names no session
 *   is also held while one of the owner's calls is crisis-held and not ended, or ended less than
 *   AFTER_CALL_GRACE_MS ago: a crisis hold is session-keyed (crisis-memory-hold.ts), so the
 *   after-call writes need this projection. A write that names its session keeps that session's
 *   own crisis state, so another live call of the same owner is not held by this one's crisis, as
 *   today. Otherwise 'pending' while a crisis read is still running (of the named session, or, with
 *   none named, of any of the owner's): its verdict could still hold the call. Otherwise open.
 * - safety-record (crisis_events): careHeld, exactly as today.
 * - control (consent, the hold records, deletion): always open.
 *
 * held beats pending beats open, so a definite hold never reads as pending.
 *
 * The hold flags are copied the first time a session is seen (the first writeHold naming it, or its
 * end in after-call-tasks.ts) and never replaced. A decision is held under the flags now OR under
 * the copies of the named session and the owner's recent ones, so after-call work never runs under
 * the next caller's flags alone. Owners come from minor-care.ts sessionUser.
 *
 * Voice-process memory only: another process learns nothing from it.
 *
 * @module utils/write-hold
 */
import {
  crisisHeldSessions,
  crisisMemoryHeld,
  crisisReadingSessions,
  crisisReadsSettled,
} from './crisis-memory-hold.js';
import { careHeld, IDLE_MS, likelyMinor, sessionUser, sharedId, writeHeld } from './minor-care.js';
import { sexualTopicHeld } from './sexual-topic-hold.js';

type Env = Record<string, string | undefined>;

export type WriteKind = 'content' | 'safety-record' | 'control';
export type WriteHold = 'held' | 'open' | 'pending';

/** How long a crisis-held call's owner stays held after the call ends: past the after-call work. */
const AFTER_CALL_GRACE_MS = 10 * 60 * 1000;
/** Past this many sessions, ones idle past IDLE_MS that hold nothing go, oldest first. */
const MAX_SESSIONS = 500;
/** The flags a hold reads. */
const HOLD_FLAGS = [
  'MINOR_CARE',
  'MINOR_CARE_OWNERS',
  'MINOR_CARE_SHARED_HOLD',
  'SEXUAL_TOPIC_BOUNDARY',
] as const;

interface Seen {
  owner?: string;
  seenAt: number;
  endedAt?: number;
  /** The hold flags when the session was first seen: never replaced. */
  flags: Env;
}

/** sessionId -> its owner, when it was first seen and ended, and its flags then. Oldest first. */
const seen = new Map<string, Seen>();

const recent = (s: Seen): boolean => Date.now() - (s.endedAt ?? s.seenAt) <= IDLE_MS;

/** Holds anything now, under its own flags or today's: never evicted. */
const holding = (sessionId: string, s: Seen): boolean =>
  crisisMemoryHeld(sessionId) ||
  crisisReadsSettled(sessionId) !== null ||
  likelyMinor(sessionId) ||
  sexualTopicHeld(sessionId, s.flags) ||
  sexualTopicHeld(sessionId);

/** Over the cap, sessions idle past IDLE_MS that hold nothing go, oldest first. */
function evict(): void {
  for (const [sessionId, s] of seen) {
    if (seen.size <= MAX_SESSIONS) return;
    if (!recent(s) && !holding(sessionId, s)) seen.delete(sessionId);
  }
}

/** Records the session the first time it is seen (its flags then), and its owner once known. */
function remember(sessionId: string, owner: string | undefined): Seen {
  const known = seen.get(sessionId);
  if (known) {
    known.owner ??= owner;
    return known;
  }
  const flags: Env = Object.fromEntries(HOLD_FLAGS.map((f) => [f, process.env[f]]));
  const fresh: Seen = { owner, seenAt: Date.now(), flags };
  seen.set(sessionId, fresh);
  evict();
  return fresh;
}

const ownerOf = (sessionId: string): string | undefined =>
  seen.get(sessionId)?.owner ?? sessionUser(sessionId);

/** The call has ended (after-call-tasks.ts): its owner's crisis projection lasts the grace. */
export function noteSessionEnded(sessionId: string | undefined, userId?: string): void {
  if (!sessionId) return;
  const s = remember(sessionId, sharedId(userId) ? sessionUser(sessionId) : userId);
  s.endedAt ??= Date.now();
}

/** Today's flags, then the copies of the named session and of the owner's recent sessions. */
function flagSets(ownerId: string | undefined, sessionId: string | undefined): Env[] {
  const sets: Env[] = [process.env];
  for (const [id, s] of seen) {
    if (id === sessionId || (recent(s) && !sharedId(ownerId) && ownerOf(id) === ownerId))
      sets.push(s.flags);
  }
  return sets;
}

/**
 * For a write that names no session: one of this owner's calls is crisis-held and not ended, or
 * ended within the grace. One whose end never came keeps the crisis hold's own 6 h life.
 */
function crisisOwnerHeld(ownerId: string | undefined): boolean {
  if (sharedId(ownerId)) return false;
  return crisisHeldSessions().some((id) => {
    if (ownerOf(id) !== ownerId) return false;
    const endedAt = seen.get(id)?.endedAt;
    return endedAt === undefined || Date.now() - endedAt <= AFTER_CALL_GRACE_MS;
  });
}

/** A crisis read still running: of the named session, or with none named, of any of the owner's. */
function crisisReading(ownerId: string | undefined, sessionId: string | undefined): boolean {
  if (sessionId) return crisisReadsSettled(sessionId) !== null;
  return !sharedId(ownerId) && crisisReadingSessions().some((id) => ownerOf(id) === ownerId);
}

/**
 * Whether a write of this kind for this owner (and session, when known) may land now: 'held'
 * (never), 'pending' (a crisis read is still running: ask again once it settles), or 'open'.
 */
export function writeHold(write: {
  ownerId: string | undefined;
  sessionId?: string;
  kind: WriteKind;
}): WriteHold {
  const { ownerId, sessionId, kind } = write;
  if (sessionId) remember(sessionId, sessionUser(sessionId));
  if (kind === 'control') return 'open';
  const flags = flagSets(ownerId, sessionId);
  if (kind === 'safety-record')
    return flags.some((env) => careHeld(ownerId, sessionId, env)) ? 'held' : 'open';
  if (flags.some((env) => writeHeld(ownerId, sessionId, env))) return 'held';
  if (!sessionId && crisisOwnerHeld(ownerId)) return 'held';
  return crisisReading(ownerId, sessionId) ? 'pending' : 'open';
}
