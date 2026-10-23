/**
 * Which classifier-only crisis reads could be eased, logged in shadow only
 * (CRISIS_CLASSIFIER_ONLY_CHECKIN = off | shadow, off by default). Nothing
 * here changes a reply, and nothing here calls a model.
 *
 * Prod canary, 2026-10-22 (8981d4f03): "The running, not so much. Once,
 * maybe." brought the 988 line. No pattern matched; two classifier reads said
 * crisis and the agreement gate let them stand. They were one model at
 * temperature 0 on the same words (the reply gate's read and the pipeline's):
 * one read, not independent agreement. Before any design can ease such a
 * turn, shadow measures how many turns it would even consider, and why the
 * rest keep the guidance.
 *
 * A turn is `eligible` only when: the patterns found nothing now or earlier;
 * nothing on the call found risk before (callRiskBeforeTurn); the turn's reads
 * are gathered under a scope (CRISIS_AGREEMENT_GATE or CRISIS_ADJUDICATOR on;
 * otherwise a read counts as missing), all arrived, none imminent, every
 * crisis read about the caller; the caller never said they are under 18; the
 * caller's words and last five lines hold no broad risk word (hasRiskContent)
 * and no escalate-only cue (crisis-classifier-only-text.ts); no agreement with
 * Ferni's line and no safety talk in it; and at least three earlier caller
 * lines. Every other turn logs the first reason it keeps the guidance, and the
 * cue family when a cue decided it.
 *
 * Shadow work is fire-and-forget, hooked to the turn pipeline once its crisis
 * read settles (turn-crisis.ts): nothing is wrapped or awaited on the turn's
 * path, and any error is swallowed. The reply gate is untouched.
 *
 * @module CrisisClassifierOnly
 */

import { statesUnder18 } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import { turnVerdicts, type CrisisVerdict } from './crisis-classifier.js';
import { escalateOnlyCue } from './crisis-classifier-only-text.js';
import { detectCrisis, type CrisisDetectionResult } from './crisis-guard.js';
import { SAFETY_TALK } from './crisis-lone-imminent.js';

const log = createLogger({ module: 'CrisisClassifierOnly' });

type Env = Record<string, string | undefined>;
export type ClassifierOnlyMode = 'off' | 'shadow';

/** shadow, or off for anything else (there is no live mode). */
export function resolveClassifierOnlyCheckin(env: Env = process.env): ClassifierOnlyMode {
  return env.CRISIS_CLASSIFIER_ONLY_CHECKIN?.trim().toLowerCase() === 'shadow' ? 'shadow' : 'off';
}

/** Why a classifier crisis read keeps the guidance, or 'eligible'. */
export type ClassifierOnlyWhy =
  | 'eligible'
  | 'pattern'
  | 'prior_risk'
  | 'missing_read'
  | 'imminent'
  | 'no_crisis_read'
  | 'third_party'
  | 'minor'
  | 'risk_words'
  | 'escalate_words'
  | 'endorses'
  | 'safety_talk'
  | 'earlier_pattern'
  | 'too_early'
  | 'error';

export interface ClassifierOnlyArgs {
  /** The patterns' reading of this turn, before the classifier. */
  detection: CrisisDetectionResult;
  /** Every classifier read of this turn, from either path. */
  verdicts: ReadonlyArray<CrisisVerdict | null>;
  latest: string;
  /** The caller's earlier words this call, oldest first. */
  earlier?: readonly string[];
  /** Ferni's line the caller's words answer. */
  companion?: string;
  /** callRiskBeforeTurn for this turn. */
  priorRisk: boolean;
}

export interface ClassifierOnlyDecision {
  why: ClassifierOnlyWhy;
  /** The escalate-only family that decided it, for 'escalate_words'. */
  cue?: string;
}

/** Earlier caller lines a call needs before a read could be eased. */
const MIN_EARLIER_LINES = 3;
/** The earlier lines the classifier sees (crisis-classifier.ts), checked for words. */
const RECENT_LINES = 5;

const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const patternsFound = (d: CrisisDetectionResult): boolean =>
  d.isCrisis || d.severity !== 0 || d.indicators.length > 0;

/** The checks that need no read: the patterns, the call, the age and the words. */
function wordsAndCall(args: ClassifierOnlyArgs): ClassifierOnlyDecision {
  const { detection, latest, companion, priorRisk } = args;
  if (patternsFound(detection)) return { why: 'pattern' };
  if (priorRisk !== false) return { why: 'prior_risk' };
  const given: readonly unknown[] = args.earlier ?? [];
  if (given.some((line) => typeof line !== 'string')) return { why: 'earlier_pattern' };
  // A caller who said they are under 18 keeps the guidance, whatever MINOR_CARE says.
  if ([latest, ...(given as string[])].some((line) => statesUnder18(line))) return { why: 'minor' };
  if (hasRiskContent(latest)) return { why: 'risk_words' };
  const cue = escalateOnlyCue(latest);
  if (cue) return { why: 'escalate_words', cue };
  if (endorses(latest)) return { why: 'endorses' };
  if (companion !== undefined && typeof companion !== 'string') return { why: 'safety_talk' };
  if (companion !== undefined && SAFETY_TALK.test(normalized(companion))) {
    return { why: 'safety_talk' };
  }
  const own = latest.trim();
  const earlier = (given as readonly string[])
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== own);
  if (earlier.some((line) => patternsFound(detectCrisis(line)))) return { why: 'earlier_pattern' };
  if (earlier.length < MIN_EARLIER_LINES) return { why: 'too_early' };
  const recent = earlier.slice(-RECENT_LINES);
  if (recent.some(hasRiskContent)) return { why: 'risk_words' };
  const earlierCue = recent.map(escalateOnlyCue).find(Boolean);
  if (earlierCue) return { why: 'escalate_words', cue: earlierCue };
  return { why: 'eligible' };
}

function decide(args: ClassifierOnlyArgs): ClassifierOnlyDecision {
  const verdicts: ReadonlyArray<unknown> = Array.isArray(args.verdicts) ? args.verdicts : [];
  const reads = verdicts as ReadonlyArray<CrisisVerdict | null>;
  // A read that timed out or failed might have been the one that saw imminent risk.
  if (reads.length === 0 || reads.some((v) => !v || typeof v.risk !== 'string')) {
    return { why: 'missing_read' };
  }
  const all = reads as readonly CrisisVerdict[];
  if (all.some((v) => v.risk === 'imminent')) return { why: 'imminent' };
  const crisis = all.filter((v) => v.risk === 'crisis');
  if (crisis.length === 0) return { why: 'no_crisis_read' };
  if (crisis.some((v) => v.subject !== 'self')) return { why: 'third_party' };
  return wordsAndCall(args);
}

/** The first reason this turn keeps the guidance, or 'eligible'. Fails closed. */
export function classifierOnlyDecision(args: ClassifierOnlyArgs): ClassifierOnlyDecision {
  try {
    return decide(args);
  } catch {
    return { why: 'error' };
  }
}

export function classifierOnlyWhy(args: ClassifierOnlyArgs): ClassifierOnlyWhy {
  return classifierOnlyDecision(args).why;
}

/** What the turn pipeline knew about this turn when its classifier read started. */
export interface ShadowTurn {
  detection: CrisisDetectionResult;
  latest: string;
  earlier: readonly string[];
  companion?: string;
  /** callRiskBeforeTurn, taken before this turn's read started. */
  priorRisk: boolean;
  scope?: string;
}

/**
 * CRISIS_CLASSIFIER_ONLY_CHECKIN=shadow: once the turn has settled with the
 * classifier's reading in place (`escalated`), log whether the turn was
 * eligible and why not. Returns nothing and never throws; the turn is neither
 * wrapped nor delayed.
 */
export function shadowClassifierOnly(
  escalated: Promise<boolean>,
  turn: ShadowTurn,
  env: Env = process.env
): void {
  try {
    if (resolveClassifierOnlyCheckin(env) !== 'shadow') return;
    void escalated
      .then(async (classifierEscalated) => {
        if (!classifierEscalated) return;
        const { latest, earlier, companion, scope } = turn;
        const input = { latest, earlier, companion };
        // No scope to gather the turn's reads under counts as a missing read.
        const verdicts = scope ? await turnVerdicts(scope, input).catch(() => [null]) : [null];
        const { why, cue } = classifierOnlyDecision({ ...turn, verdicts });
        log.info(
          {
            mode: 'shadow',
            outcome: why === 'eligible' ? 'eligible' : 'escalate',
            why,
            ...(cue ? { cue } : {}),
            reads: scope ? verdicts.length : 0,
          },
          'CRISIS_CLASSIFIER_ONLY'
        );
      })
      .catch(() => undefined);
  } catch {
    // Shadow work never affects the turn.
  }
}
