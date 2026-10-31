/**
 * CRISIS_CLASSIFIER_ONLY_CHECKIN=live: a classifier-only crisis read is eased
 * to the soft check only when the quarantined easing read says so.
 *
 * Prod canary, 2026-10-22 (8981d4f03): "The running, not so much. Once,
 * maybe." brought the 988 line on two reads of one model at temperature 0.
 * PR A (crisis-classifier-only.ts) logs which such turns could be eased. Here,
 * a turn A finds eligible gets one easing read (crisis-easing-extract.ts:
 * outer meta-language gate, quarantined extraction, verified quotes, the
 * union with the code's cues, fail closed on anomalies), decided by a pure
 * function (crisis-easing-decision.ts). It is eased only if, once that read is
 * back, every read of the turn still allows it and none is in flight.
 *
 * One read per turn, shared: whichever path asks first (the reply gate, often
 * early, as soon as its own read is a crisis; or the turn pipeline) starts it
 * from its transcript, and the other uses it. Live is held with
 * CRISIS_ADJUDICATOR=live (adjudicatorCheckinsMayChangeReplies): while held,
 * a live flag decides off the reply path and only logs (liveHeld). Logs carry
 * the decision and why, never the caller's words.
 *
 * @module CrisisClassifierOnlyLive
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  adjudicatorCheckinsMayChangeReplies,
  createGeminiAdjudicatorGenerate,
  type AdjudicatorLine,
} from './crisis-adjudicator.js';
import { turnReadInFlight } from './crisis-call-risk.js';
import {
  turnVerdicts,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from './crisis-classifier.js';
import { classifierOnlyDecision, type ClassifierOnlyArgs } from './crisis-classifier-only.js';
import { easingWhy, type EasingWhy } from './crisis-easing-decision.js';
import { readEasingFacts } from './crisis-easing-extract.js';

const log = createLogger({ module: 'CrisisClassifierOnly' });

type Env = Record<string, string | undefined>;
/** held: live was asked for while the shared hold stands; decides and logs, changes nothing. */
export type EasingMode = 'off' | 'held' | 'live';

export function resolveEasingMode(env: Env = process.env): EasingMode {
  if (env.CRISIS_CLASSIFIER_ONLY_CHECKIN?.trim().toLowerCase() !== 'live') return 'off';
  return adjudicatorCheckinsMayChangeReplies() ? 'live' : 'held';
}

/** The easing read's reads run in parallel; flash-lite measured p50 ~0.86 s, p90 ~1.1 s each. */
export const DEFAULT_EASING_TIMEOUT_MS = 2000;

export function resolveEasingTimeoutMs(env: Env = process.env): number {
  const ms = Number(env.CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_EASING_TIMEOUT_MS;
}

/** The extraction's JSON is longer than a verdict. */
const EXTRACT_MAX_TOKENS = 400;

interface SharedRead {
  why: EasingWhy;
  anomaly?: string;
  ms: number;
}

/** Per call: each turn's caller words and its one easing read. */
interface TurnRead {
  at: number;
  turn: string;
  read: Promise<SharedRead>;
}
const TTL_MS = 30_000;
const MAX_CALLS = 64;
const turnReads = new Map<string, TurnRead[]>();
let defaultGenerate: CrisisGenerateFn | null = null;

/** For tests: forget shared easing reads. */
export function resetEasingReads(): void {
  turnReads.clear();
}

const looseTurn = (latest: string): string =>
  latest
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** This turn's one easing read, started from `lines` if no path has started it. Never rejects. */
function sharedRead(
  call: string,
  latest: string,
  lines: () => readonly AdjudicatorLine[],
  generate: CrisisGenerateFn | undefined,
  env: Env
): Promise<SharedRead> {
  const now = Date.now();
  for (const [k, list] of turnReads) {
    const fresh = list.filter((e) => now - e.at <= TTL_MS);
    if (fresh.length) turnReads.set(k, fresh);
    else turnReads.delete(k);
  }
  const turn = looseTurn(latest);
  const list = turnReads.get(call) ?? [];
  // One path may hold a truncated line: the same words either way round are the same turn.
  const found = list.find((e) => e.turn === turn || e.turn.includes(turn) || turn.includes(e.turn));
  if (found) return found.read;
  if (!turnReads.has(call) && turnReads.size >= MAX_CALLS) {
    const oldest = turnReads.keys().next().value;
    if (oldest !== undefined) turnReads.delete(oldest);
  }
  const model =
    generate ??
    (defaultGenerate ??= createGeminiAdjudicatorGenerate(undefined, EXTRACT_MAX_TOKENS));
  const read = Promise.resolve()
    .then(async () => readEasingFacts(lines(), model, resolveEasingTimeoutMs(env)))
    .then((r) => ({
      why: easingWhy(r),
      ...(r.ok ? {} : { anomaly: r.anomaly }),
      ms: Date.now() - now,
    }))
    .catch((): SharedRead => ({ why: 'error', ms: Date.now() - now }));
  if (turn) turnReads.set(call, [...list, { at: now, turn, read }]);
  return read;
}

/** What a path knew about the turn when its classifier read started. */
export interface EasingTurn extends Omit<ClassifierOnlyArgs, 'verdicts'> {
  /** The turn's reads are kept under this scope (turnVerdicts); without one, a read counts as missing. */
  scope?: string;
  /** The call's session id: the shared read is keyed by it. */
  call?: string;
}

export interface EasingOptions {
  /** The call's recent lines by speaker, for the easing read if this path starts it. */
  transcript: () => readonly AdjudicatorLine[];
  generate?: CrisisGenerateFn;
  env?: Env;
  source: 'gate' | 'pipeline';
}

const inputOf = (t: EasingTurn): CrisisClassifierInput => ({
  latest: t.latest,
  earlier: t.earlier ?? [],
  companion: t.companion,
});

/** Every check, the shared read, and the re-check. Never rejects. */
async function decideTurn(
  turn: EasingTurn,
  options: EasingOptions,
  env: Env
): Promise<Record<string, unknown> & { eased: boolean }> {
  const { scope, call } = turn;
  // Fail closed: a failed lookup, or no call to gather reads under, counts as a missing read.
  const reads = async () =>
    scope ? turnVerdicts(scope, inputOf(turn)).catch(() => [null]) : [null];
  const verdicts = await reads();
  const first = classifierOnlyDecision({ ...turn, verdicts });
  const base = { reads: scope ? verdicts.length : 0 };
  if (first.why !== 'eligible') {
    return { ...base, eased: false, why: first.why, ...(first.cue ? { cue: first.cue } : {}) };
  }
  if (!call) return { ...base, eased: false, why: 'missing_read' };
  const read = await sharedRead(call, turn.latest, options.transcript, options.generate, env);
  const fields = {
    ...base,
    read: read.why,
    ...(read.anomaly ? { anomaly: read.anomaly } : {}),
    readMs: read.ms,
  };
  if (read.why !== 'eased') return { ...fields, eased: false, why: 'read' };
  // A read of this turn may have started or finished while the easing read was out
  // (2026-10-22 verify: the pipeline's imminent read 60 ms after the gate's crisis read).
  const now = classifierOnlyDecision({ ...turn, verdicts: await reads() });
  const late =
    now.why !== 'eligible' ? now.why : turnReadInFlight(call, turn.latest) ? 'in_flight' : null;
  if (late) return { ...fields, eased: false, why: 'late', late };
  return { ...fields, eased: true, why: 'eased' };
}

/**
 * For a turn whose classifier read is about to bring crisis guidance: true
 * only when live (and not held), A finds it eligible, and the turn's easing
 * read eases it, so it gets the soft check instead. Held decides off the reply
 * path and returns false at once. Logs one CRISIS_CLASSIFIER_ONLY line unless
 * off. Never throws.
 */
export async function easingCheckin(turn: EasingTurn, options: EasingOptions): Promise<boolean> {
  try {
    const env = options.env ?? process.env;
    const mode = resolveEasingMode(env);
    if (mode === 'off') return false;
    const decided = decideTurn(turn, options, env)
      .catch(() => ({ eased: false, why: 'error' }))
      .then(({ eased, ...fields }) => {
        try {
          log.info(
            { mode, source: options.source, outcome: eased ? 'eased' : 'escalate', ...fields },
            'CRISIS_CLASSIFIER_ONLY'
          );
        } catch {
          // Logging never changes the decision.
        }
        return eased;
      });
    if (mode !== 'live') return false;
    return await decided;
  } catch {
    return false;
  }
}

/**
 * The reply gate, as soon as its own read is a crisis read about the caller:
 * start the shared read early when nothing but the other path's read could
 * still stop it, so it overlaps the wait. The final decision still checks
 * every read. Never throws.
 */
export function prestartEasing(
  turn: EasingTurn,
  verdict: CrisisVerdict | null,
  options: EasingOptions
): void {
  try {
    const env = options.env ?? process.env;
    if (resolveEasingMode(env) === 'off' || !turn.call) return;
    if (verdict?.risk !== 'crisis' || verdict.subject !== 'self') return;
    if (classifierOnlyDecision({ ...turn, verdicts: [verdict] }).why !== 'eligible') return;
    void sharedRead(turn.call, turn.latest, options.transcript, options.generate, env);
  } catch {
    // An early start is only an optimisation.
  }
}
