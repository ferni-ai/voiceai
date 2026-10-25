/**
 * FRIEND_REPAIR=on: a miss the caller corrects stays corrected, on the next
 * call too (issue #1512).
 *
 * REPAIR_MODE (correction-repair.ts) carries a correction for one call only,
 * so "my brother in Denver, not my sister" was gone by the next. With this on:
 *
 * 1. A correction of a fact (the "<this>, not <that>" shape, where <that> is
 *    something Ferni stated, never asked) is kept in the caller's corrections
 *    (bogle_users/{uid}/corrections, user-corrections.ts) with its provenance:
 *    the caller's words, the line they corrected, the call and the time.
 *    A mishear of wording ("that's not what I said") or a "No, ..." answer to
 *    a question is not a fact correction, so nothing is kept for it.
 * 2. The stored facts that said <that> are retired the way fact supersession
 *    retires them (supersededAt / supersededBy, the correction's id), plus
 *    correctedAt: kept for audit, never recalled (session-recall.ts), because
 *    a miss is not "how things were before".
 * 3. The next call's first recall note (memory-recall-hook.ts) says what they
 *    corrected: the three most recent, from the last 30 days.
 *
 * The detector is correction-repair.ts's own contrast rule (contrastWith), a
 * pure function, so this works with REPAIR_MODE off. The in-call line that
 * owns the miss is REPAIR_MODE's; with both on it names what Ferni had wrong.
 *
 * @module agents/personas/friend-repair
 */

import type { StoredFact } from '../../memory/dynamic/fact-supersession.js';
import { contentWords } from '../../memory/recall/session-recall.js';
import { createLogger } from '../../utils/safe-logger.js';
import { memoryHeld, userHeld } from '../../utils/minor-care.js';
import { contrastWith } from './correction-repair.js';
import { firestoreRepairStore } from './friend-repair-store.js';

const log = createLogger({ module: 'FriendRepair' });

export function friendRepairEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.FRIEND_REPAIR === 'on';
}

export interface FactCorrection {
  /** What they said is so, in their words: "my brother in Denver". */
  right: string;
  /** What Ferni had, in their words: "my sister". */
  wrong: string;
}

/** Openers that aren't part of the fact: "No, it's my brother", "Ha, I said Galway". */
const LEAD =
  /^(?:(?:no|nope|nah|actually|well|oh|ha|haha|sorry|wait)\b[,.!]?\s*)*(?:(?:it'?s|it is|it was|that'?s|that is|that was|i said)\s+)?/i;
const MAX_RIGHT_WORDS = 8;

const tidy = (part: string): string =>
  part
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .replace(LEAD, '')
    .trim();

/**
 * The fact a caller's words correct, or null: only a correction by the
 * precise detector, in the "<this>, not <that>" shape, with <this> short.
 */
export function factCorrection(said: string, ferni: string[]): FactCorrection | null {
  // isCorrection's contrast rule: a word Ferni stated (never asked), after "not".
  const hit = contrastWith(said, ferni);
  if (!hit) return null;
  // "my brother in Denver, not my sister" or "not my sister, my brother".
  const before = said.slice(0, hit.index).split(/[.!?]/).pop() ?? '';
  const after = said.slice(hit.index + hit.text.length).split(/[.!?]/)[0] ?? '';
  const right = tidy(before) || tidy(after);
  const wrong = hit.text.replace(/^not\s+/i, '');
  const words = right.split(/\s+/).filter(Boolean).length;
  if (words === 0 || words > MAX_RIGHT_WORDS) return null;
  if (contentWords(right).has(hit.word)) return null;
  return { right, wrong };
}

/** A stored fact, as the supersession store reads it. */
export type RepairFact = Pick<StoredFact, 'id' | 'entityName' | 'key' | 'value' | 'supersededAt'>;

/** At most this many facts are retired by one correction. */
const MAX_RETIRED = 3;

/**
 * The live facts a correction retires: they hold the word Ferni had wrong in
 * their value ("travel destination = Dublin"), or in their subject alongside
 * something else from the line he got wrong ("sister | lives in = Denver"
 * after "your sister in Denver"). "sister | name = Anna" stays.
 */
export function factsToRetire(
  facts: readonly RepairFact[],
  correction: FactCorrection,
  ferniLine: string
): RepairFact[] {
  const wrong = contentWords(correction.wrong);
  const context = [...contentWords(ferniLine)].filter((w) => !wrong.has(w));
  const has = (text: string, words: Iterable<string>): boolean => {
    const inText = contentWords(text);
    return [...words].some((w) => inText.has(w));
  };
  return facts
    .filter((f) => !f.supersededAt)
    .filter((f) => {
      const all = `${f.entityName} ${f.key.replace(/_/g, ' ')} ${f.value}`;
      return has(f.value, wrong) || (has(all, wrong) && has(all, context));
    })
    .slice(0, MAX_RETIRED);
}

/** One kept correction, with where it came from. */
export interface RepairRecord {
  right: string;
  wrong: string;
  /** The caller's words, as said. */
  said: string;
  /** Ferni's line they corrected. */
  ferniSaid: string;
  /** The call it was said on (the session id). */
  callId?: string;
  personaId?: string;
  /** When (ISO). */
  at: string;
  supersededFactIds: string[];
}

export interface RepairStore {
  facts: (userId: string) => Promise<RepairFact[]>;
  /** Keeps the correction; returns its id. */
  add: (userId: string, record: RepairRecord) => Promise<string>;
  /** Marks the facts superseded by the correction, and corrected (never recalled). */
  retire: (userId: string, factIds: string[], by: string, at: string) => Promise<void>;
  /** The caller's kept corrections, newest first. */
  recent: (userId: string) => Promise<RepairRecord[]>;
}

/** The caller's words this turn, and Ferni's lines before them, oldest first. */
export interface CallerTurn {
  userId: string;
  said: string;
  ferni: string[];
  callId?: string;
  personaId?: string;
}

/**
 * After a caller turn: keep a fact correction and retire what it corrects.
 * Returns the kept correction's id, or null when the turn corrected no fact
 * or FRIEND_REPAIR is off.
 */
export async function recordFriendRepair(
  turn: CallerTurn,
  store: RepairStore = firestoreRepairStore,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date()
): Promise<string | null> {
  if (!friendRepairEnabled(env)) return null;
  // MINOR_CARE: nothing kept, and no stored fact retired, for a held caller under 18.
  if (memoryHeld(turn.callId, env) || userHeld(turn.userId, env)) return null;
  const correction = factCorrection(turn.said, turn.ferni);
  if (!correction) return null;
  // His latest line with the word they corrected.
  const wrong = contentWords(correction.wrong);
  const ferniSaid =
    [...turn.ferni].reverse().find((l) => [...contentWords(l)].some((w) => wrong.has(w))) ?? '';
  const retired = factsToRetire(await store.facts(turn.userId), correction, ferniSaid);
  const ids = retired.map((f) => f.id);
  const at = now.toISOString();
  const id = await store.add(turn.userId, {
    ...correction,
    said: turn.said,
    ferniSaid,
    ...(turn.callId && { callId: turn.callId }),
    ...(turn.personaId && { personaId: turn.personaId }),
    at,
    supersededFactIds: ids,
  });
  if (ids.length > 0) await store.retire(turn.userId, ids, id, at);
  log.info({ retired: ids.length }, 'FRIEND_REPAIR correction kept');
  return id;
}

/** Corrections carried to later calls: the newest few, for a month. */
export const REPAIRS_CARRIED = 3;
export const REPAIR_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const ago = (at: string, now: number): string => {
  const days = Math.floor((now - Date.parse(at)) / DAY_MS);
  return days < 1 ? 'earlier today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/** The note for a later call's first turn, or null when there is nothing recent. */
export function repairNote(records: readonly RepairRecord[], now: number): string | null {
  const recent = (r: RepairRecord): boolean =>
    Date.parse(r.at) <= now && now - Date.parse(r.at) < REPAIR_DAYS * DAY_MS;
  const miss = (r: RepairRecord): string => r.wrong.toLowerCase();
  const fresh = records
    .filter(recent)
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((r, i, all) => all.findIndex((o) => miss(o) === miss(r)) === i) // newest per miss
    .slice(0, REPAIRS_CARRIED);
  if (fresh.length === 0) return null;
  return [
    '[THEY CORRECTED YOU BEFORE]',
    ...fresh.map((r) => `- ${ago(r.at, now)}: ${r.right}, not ${r.wrong}. Go by ${r.right}.`),
    "Never say your old version again. Don't bring the mix-up up unless they do.",
  ].join('\n');
}

/**
 * At call start: the corrections from earlier calls, for the first recall
 * note. `ready` never rejects; `note` is null until loaded, or when off.
 */
export function loadRepairRecall(
  userId: string,
  store: Pick<RepairStore, 'recent'> = firestoreRepairStore,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now()
): { ready: Promise<void>; note: () => string | null } {
  if (!friendRepairEnabled(env)) return { ready: Promise.resolve(), note: () => null };
  let note: string | null = null;
  const ready = store
    .recent(userId)
    .then((records) => {
      note = repairNote(records, now);
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Corrections not loaded'));
  return { ready, note: () => note };
}
