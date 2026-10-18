/**
 * Letters to future you: kept, then read back once their day comes.
 *
 * The futureSelfLetter tool told the caller "I'll hold onto this until <date>"
 * and stored nothing. Now sealing a letter keeps it
 * (bogle_users/{uid}/future_letters), and on or after its day:
 * - asked in a call ("did I get a letter?"), the tool reads it back once;
 * - with FUTURE_LETTER_OPENER=on, Jordan's hello may offer it ("you wrote
 *   yourself a letter on <date>, want to hear it?"), at most once a week.
 *
 * Only the account's owner on the line can seal or hear a letter. A letter
 * about a topic the caller asked Ferni to forget is dropped when it is next
 * read; while that list can't be read, letters wait. The letter's words go to
 * the store and to the caller, never to a log.
 *
 * Tools (L3) may not import the Firestore store, the memory context's forget
 * list or the call's owner check, so the call layer hands them in
 * (agents/voice-agent-entry/future-letter-register.ts). Until it has, nothing
 * is kept and the tool says so.
 *
 * @module tools/domains/engagement/future-letters
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'future-letters' });

export interface FutureLetter {
  readonly id: string;
  readonly body: string;
  /** UTC ISO instants. */
  readonly writtenAt: string;
  readonly deliverAt: string;
  readonly offeredAt?: string;
}

export interface FutureLetterStore {
  seal: (userId: string, letter: Omit<FutureLetter, 'id'>) => Promise<FutureLetter>;
  /** Letters not yet read back. */
  sealed: (userId: string) => Promise<FutureLetter[]>;
  delivered: (userId: string, id: string, at: string) => Promise<void>;
  offered: (userId: string, id: string, at: string) => Promise<void>;
  drop: (userId: string, id: string) => Promise<void>;
}

export interface FutureLetterPorts {
  /** The store, or null where there is none (local dev without credentials). */
  store: () => FutureLetterStore | null;
  /** Is `text` about a topic the caller asked to forget? null when that can't be known. */
  forgotten: (userId: string, text: string) => Promise<boolean | null>;
  /** The account's proven owner is on this call, and it isn't a call Ferni placed to someone. */
  ownerOnTheLine: (sessionId: string) => boolean;
}

let ports: FutureLetterPorts | null = null;

/** Called once by the call layer; null unplugs (tests). */
export function setFutureLetterPorts(next: FutureLetterPorts | null): void {
  ports = next;
}

export function futureLetterOpenerOn(env: Env = process.env): boolean {
  return flagOn('FUTURE_LETTER_OPENER', env);
}

/** Jordan keeps the letters (the tool's own persona); nobody else offers one in a hello. */
export const LETTER_KEEPER = 'jordan-taylor';
const OFFER_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

/** "October 18, 2027" in the caller's zone (UTC when unknown). */
export function spokenDate(iso: string, zone = 'UTC'): string {
  const opts = { month: 'long', day: 'numeric', year: 'numeric' } as const;
  try {
    return new Date(iso).toLocaleDateString('en-US', { ...opts, timeZone: zone });
  } catch {
    return new Date(iso).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  }
}

interface Caller {
  userId: string;
  sessionId?: string;
}

interface Ready {
  store: FutureLetterStore;
  p: FutureLetterPorts;
}
type Refusal = 'not-wired' | 'not-owner' | 'no-store';

function ready(caller: Caller): Ready | Refusal {
  if (!ports) return 'not-wired';
  if (!caller.sessionId || !ports.ownerOnTheLine(caller.sessionId)) return 'not-owner';
  const store = ports.store();
  return store ? { store, p: ports } : 'no-store';
}

export type SealOutcome =
  { kept: true; letter: FutureLetter } | { kept: false; reason: Refusal | 'error' };

/** Keeps the letter until `deliverAt`. Never throws. */
export async function sealFutureLetter(
  caller: Caller,
  body: string,
  deliverAt: Date,
  now: Date = new Date()
): Promise<SealOutcome> {
  const r = ready(caller);
  if (typeof r === 'string') return { kept: false, reason: r };
  try {
    const letter = await r.store.seal(caller.userId, {
      body,
      writtenAt: now.toISOString(),
      deliverAt: deliverAt.toISOString(),
    });
    return { kept: true, letter };
  } catch (error) {
    log.warn({ error: String(error) }, 'Future letter not kept');
    return { kept: false, reason: 'error' };
  }
}

/** Their letters whose day has come, oldest first; forgotten ones are dropped, unknown ones wait. */
async function dueLetters({ store, p }: Ready, userId: string, now: Date): Promise<FutureLetter[]> {
  const at = now.toISOString();
  const due = (await store.sealed(userId))
    .filter((l) => l.deliverAt <= at)
    .sort((a, b) => a.deliverAt.localeCompare(b.deliverAt));
  const verdicts = await Promise.all(due.map(async (l) => p.forgotten(userId, l.body)));
  await Promise.all(
    due.filter((_, i) => verdicts[i] === true).map(async (l) => store.drop(userId, l.id))
  );
  return due.filter((_, i) => verdicts[i] === false);
}

/** The oldest letter that is due, marked as read back; null when none (or not theirs to hear). */
export async function deliverDueLetter(
  caller: Caller,
  now: Date = new Date()
): Promise<FutureLetter | null> {
  const r = ready(caller);
  if (typeof r === 'string') return null;
  try {
    const letter = (await dueLetters(r, caller.userId, now)).at(0);
    if (letter === undefined) return null;
    await r.store.delivered(caller.userId, letter.id, now.toISOString());
    return letter;
  } catch (error) {
    log.warn({ error: String(error) }, 'Future letter not read');
    return null;
  }
}

/** When each kept letter comes due, soonest first; null when they can't be read. */
export async function pendingLetterDates(caller: Caller): Promise<string[] | null> {
  const r = ready(caller);
  if (typeof r === 'string') return null;
  try {
    return (await r.store.sealed(caller.userId)).map((l) => l.deliverAt).sort();
  } catch (error) {
    log.warn({ error: String(error) }, 'Future letters not listed');
    return null;
  }
}

export interface LetterOffer {
  /** "October 18, 2026": the day they wrote it. */
  writtenOn: string;
  /** Records it as offered, so the hello doesn't offer it again this week. Never rejects. */
  mark: () => void;
}

/**
 * A due letter Jordan's hello may offer, or undefined: flag off, another
 * persona, not the owner, none due, or offered in the last week.
 */
export async function letterToOffer(
  caller: Caller & { personaId: string; zone?: string },
  now: Date = new Date(),
  env: Env = process.env
): Promise<LetterOffer | undefined> {
  if (!futureLetterOpenerOn(env) || caller.personaId !== LETTER_KEEPER) return undefined;
  const r = ready(caller);
  if (typeof r === 'string') return undefined;
  try {
    const letter = (await dueLetters(r, caller.userId, now)).find(
      (l) => !l.offeredAt || now.getTime() - Date.parse(l.offeredAt) >= OFFER_AGAIN_MS
    );
    if (!letter) return undefined;
    return {
      writtenOn: spokenDate(letter.writtenAt, caller.zone),
      mark: () => {
        r.store
          .offered(caller.userId, letter.id, now.toISOString())
          .catch((error: unknown) => log.warn({ error: String(error) }, 'Letter offer not marked'));
      },
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Future letters not read for the hello');
    return undefined;
  }
}

/** The hello's direction when a letter is waiting. Never the letter's words. */
export function letterOfferDirection(o: LetterOffer): string {
  return ` They wrote themselves a letter on ${o.writtenOn} and its day has come. You may offer it once, lightly ("You wrote yourself a letter on ${o.writtenOn}. Want to hear it?"). Don't guess what it says.`;
}

/** True when the spoken line offered the letter, so it counts as offered. */
export function lineOffersLetter(line: string): boolean {
  return /\bletter\b/i.test(line);
}
