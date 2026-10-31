/**
 * An imminent crisis read needs agreement (CRISIS_IMMINENT_NEEDS_AGREEMENT=on,
 * off by default).
 *
 * With the everyday rules on (crisis-everyday.ts), a caller line holding any
 * word from the agreement gate's broad risk list ("last", "bye", "done",
 * "ready", ...) is read twice, with the rules and without them, and the more
 * severe read wins. The backstop was built so the rules could never LOWER a
 * read; it also lets one read RAISE a turn to imminent on its own.
 *
 * Dev, 2026-10-30 (a synthetic eval call): an ordinary request, cut off
 * mid-sentence, held one of those words. The read with the rules said
 * imminent and the read without them said none, on every replay. The more
 * severe read won and the reply was replaced with the 911 and 988 script. The
 * caller's plain goodbye on the next turn got the script again: there, one
 * read said imminent and the other none, at random, from either prompt. No
 * pattern matched either line.
 *
 * With the flag on, two reads of one turn that split imminent / none give a
 * crisis read instead: the reply carries crisis guidance, which always offers
 * 988, rather than the 911 script. Only when all of these hold:
 *   - both reads came back (a missing read keeps the imminent read);
 *   - the read with the rules is imminent and the one without is none (the
 *     rules raised it alone), or the other way round on a plain sign-off
 *     ("okay, bye", "great, thanks, bye for now": crisis-lone-imminent.ts
 *     isPlainSignOff, plus a bare thanks). Without the rules, an imminent
 *     read of anything else stands: on the labelled sets that direction also
 *     holds real quiet preparation ("call my wife to take the kids tonight");
 *   - imminent / crisis keeps imminent;
 *   - the patterns found nothing in this turn (pattern outcome none);
 *   - no caller line in the classifier's window matches a pattern;
 *   - nothing earlier on this call was read as risk by reads that agreed or
 *     by the patterns (a split turn does not count), and the call is known.
 * Everything else, and any error, is the more severe read as before.
 *
 * CRISIS_BRAKE_V2 (crisis-brake.ts) implies this flag for its calls: one code path, no copy.
 *
 * @module CrisisImminentAgreement
 */

import { createLogger } from '../../utils/safe-logger.js';
import { crisisBrakeOn, resolveCrisisBrakeV2 } from './crisis-brake.js';
import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';
import { moreSevereRead } from './crisis-everyday.js';
import { detectCrisis } from './crisis-guard.js';
import { isPlainSignOff } from './crisis-lone-imminent.js';

const log = createLogger({ module: 'CrisisImminentAgreement' });

const flagOn = (env: Record<string, string | undefined>): boolean =>
  env.CRISIS_IMMINENT_NEEDS_AGREEMENT?.trim().toLowerCase() === 'on';

/** The flag, or CRISIS_BRAKE_V2: for the cache scope and the pattern-block note. */
function resolveImminentNeedsAgreement(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn(env) || resolveCrisisBrakeV2(env);
}

/** This turn's split may ease: the flag, or CRISIS_BRAKE_V2 on a call it applies to (no minors). */
const readsNeedAgreement = ({ env = process.env, call, latest, earlier }: TurnReads): boolean =>
  flagOn(env) || crisisBrakeOn(env, call, [latest, ...earlier]);

/**
 * Calls where reads that agreed, or the patterns, found risk: never eased
 * again. Like crisis-call-risk.ts, a call is only dropped once its 6 hours
 * from the last note are up, never to make room.
 */
const TTL_MS = 6 * 60 * 60 * 1000;
const agreedRisk = new Map<string, number>();

function noteAgreedRisk(call: string, now: number): void {
  for (const [id, at] of agreedRisk) if (now - at > TTL_MS) agreedRisk.delete(id);
  agreedRisk.set(call, now);
}

const hadAgreedRisk = (call: string, now: number): boolean => {
  const at = agreedRisk.get(call);
  return at !== undefined && now - at <= TTL_MS;
};

const patternRisk = (line: string): boolean => {
  const found = detectCrisis(line);
  return found.severity > 0 || found.indicators.length > 0;
};

export interface TurnReads {
  /** The read with the everyday rules. */
  ruled: CrisisVerdict | null;
  /** The read without them. */
  plain: CrisisVerdict | null;
  pattern: PatternOutcome;
  /** The caller's latest line. */
  latest: string;
  /** The caller's earlier lines the classifier saw. */
  earlier: readonly string[];
  /** The call; without one, nothing is eased. */
  call?: string;
  env?: Record<string, string | undefined>;
  now?: number;
}

/**
 * A turn's read: with the everyday rules, and without them when a second
 * prompt is given. A lone read stands for both, so it is only ever noted.
 */
export async function readTurn(
  read: (prompt: string) => Promise<CrisisVerdict | null>,
  [ruledPrompt, plainPrompt]: readonly [string, string | null],
  turn: Omit<TurnReads, 'ruled' | 'plain'>
): Promise<CrisisVerdict | null> {
  const [ruled, plain] = await Promise.all([
    read(ruledPrompt),
    plainPrompt === null ? undefined : read(plainPrompt),
  ]);
  return combineReads({ ...turn, ruled, plain: plain === undefined ? ruled : plain });
}

/**
 * Extra cache-key parts for the classifier's shared reads. With the flag on, a turn's combined
 * read depends on this call's flag and its own agreed risk, so it is shared only within the call.
 */
export function agreementCacheScope(
  env: Record<string, string | undefined>,
  call?: string
): string[] {
  return resolveImminentNeedsAgreement(env) ? [call ?? ''] : [];
}

/** The read for a turn read with and without the everyday rules. */
export function combineReads(reads: TurnReads): CrisisVerdict | null {
  const read = moreSevereRead(reads.ruled, reads.plain);
  if (!readsNeedAgreement(reads)) return read;
  try {
    if (!eases(reads, read)) return read;
    const imminentRead = reads.ruled?.risk === 'imminent' ? 'ruled' : 'plain';
    log.info({ imminentRead, risk: 'crisis' }, 'CRISIS_IMMINENT_SPLIT');
    return { risk: 'crisis', subject: read?.subject ?? 'self' };
  } catch {
    return read; // fail closed: an error keeps the more severe read
  }
}

/** Notes agreed risk on the call; true when this turn's split read is eased. */
function eases(reads: TurnReads, read: CrisisVerdict | null): boolean {
  const { call, now = Date.now() } = reads;
  if (!call) return false;
  const split = splitImminent(reads);
  const risk = reads.pattern !== 'none' || (read !== null && read.risk !== 'none' && !split);
  if (risk) noteAgreedRisk(call, now);
  if (!split || reads.pattern !== 'none' || hadAgreedRisk(call, now)) return false;
  if (!reads.earlier.some(patternRisk)) return true;
  noteAgreedRisk(call, now);
  return false;
}

/**
 * A turn the patterns blocked, which the live classifier never reads: risk on
 * the call. Returns null, the classifier's run for that turn.
 */
export function notePatternBlock(
  call: string | undefined,
  env: Record<string, string | undefined> = process.env,
  now = Date.now()
): null {
  if (call !== undefined && call !== '' && resolveImminentNeedsAgreement(env)) {
    noteAgreedRisk(call, now);
  }
  return null;
}

/** "thanks" / "thank you", dropped before the sign-off check; its closed set rejects the rest. */
const BARE_THANKS = /\b(?:thanks|thank you|thank u|thx)\b/gi;

/** Both reads came back: imminent with the rules and none without, or the reverse on a sign-off. */
function splitImminent({ ruled, plain, latest }: TurnReads): boolean {
  if (!ruled || !plain) return false;
  if (ruled.risk === 'imminent' && plain.risk === 'none') return true;
  if (ruled.risk !== 'none' || plain.risk !== 'imminent') return false;
  return isPlainSignOff(latest.replace(BARE_THANKS, ' '));
}

/** For tests. */
export function resetImminentAgreement(): void {
  agreedRisk.clear();
}
