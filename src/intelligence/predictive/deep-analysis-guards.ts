/**
 * Keeps weekly deep analysis from turning thin data into confident claims
 * about who the caller is.
 *
 * A dry run on the one real returning user (2026-10-10, mostly short test
 * calls) produced, at confidence 0.85: "Seth frequently deflects personal
 * inquiries ... as a protective buffer to avoid vulnerability". Insights like
 * that are injected into every turn of every call (getDeepAnalysisContextForTurn,
 * live via turn-processor/context-injections.ts), so the analysis now needs
 * real history, insights need evidence from more than one call, clinical or
 * psychological labels are dropped from the output in code, and the in-call
 * injection is off unless DEEP_ANALYSIS_IN_CALL=on.
 *
 * @module intelligence/predictive/deep-analysis-guards
 */

/** Calls with real content a weekly analysis needs before it says anything. */
export const MIN_SUBSTANTIVE_CALLS = 5;

/** Below this an insight is a guess, not a pattern. */
export const MIN_INSIGHT_CONFIDENCE = 0.75;

export function isDeepAnalysisInCallOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.DEEP_ANALYSIS_IN_CALL === 'on';
}

interface SummaryShape {
  topics: string[];
  keyMoments: string[];
}

/**
 * A call with something in it: at least one topic and two key moments, not
 * just the keyword fallback's "User asked: ..." lines (what a summary looks
 * like when the LLM summary failed or the call was a test).
 */
export function isSubstantiveSummary(s: SummaryShape): boolean {
  const real = s.keyMoments.filter((m) => !/^user asked:/i.test(m.trim()));
  return s.topics.length > 0 && real.length >= 2;
}

export function hasEnoughHistory(summaries: readonly SummaryShape[]): boolean {
  return summaries.filter(isSubstantiveSummary).length >= MIN_SUBSTANTIVE_CALLS;
}

/** The prompt's rules; the same limits are enforced on the output below. */
export const EVIDENCE_RULES =
  'Rules: an insight must be supported by at least two different conversations, cited in "evidence". ' +
  'Describe what the person said or did, never a hidden feeling, motive or defense you infer. ' +
  'No diagnoses or clinical or psychological labels (for example "defense mechanism", "avoidant", "depressed", "trauma"). ' +
  'If the conversations are short or thin, return fewer insights or none.';

/** Clinical or psych labels Ferni must never pin on someone (whole words, case-insensitive). */
const CLINICAL_LABEL =
  /\b(defen[cs]e mechanisms?|coping mechanisms?|avoidan(t|ce)|attachment (style|issues)|insecure(ly)? attached|narcissis\w*|codependen\w*|depress(ed|ion|ive)|anxiety disorder|anxious attachment|trauma(tic|tized)?|ptsd|bipolar|ocd|adhd|borderline|neurotic\w*|repress(ed|ion|ing)|in denial|projecting|projection|disorder|diagnos\w*|patholog\w*|protective buffer|emotionally unavailable|abandonment issues|self-sabotag\w*)\b/i;

export function hasClinicalLabel(text: string): boolean {
  return CLINICAL_LABEL.test(text);
}

interface InsightShape {
  observation: string;
  significance: string;
  confidence: number;
  evidence: string[];
  surfacingContext: string;
}

/** An insight grounded enough to keep: two pieces of evidence and no labels. */
export function isGroundedInsight(i: InsightShape): boolean {
  const evidence = Array.isArray(i.evidence)
    ? i.evidence.filter((e) => typeof e === 'string' && e.trim() !== '')
    : [];
  return (
    evidence.length >= 2 &&
    typeof i.observation === 'string' &&
    !hasClinicalLabel(`${i.observation} ${i.significance ?? ''}`)
  );
}

/** One that may also be spoken into a call. */
export function isSurfaceableInsight(i: InsightShape): boolean {
  return (
    isGroundedInsight(i) &&
    i.confidence >= MIN_INSIGHT_CONFIDENCE &&
    i.surfacingContext !== 'crisis_only'
  );
}

export function keepGroundedInsights<T extends InsightShape>(insights: readonly T[]): T[] {
  return insights.filter(isGroundedInsight);
}

/** Drops any free-text item (hypothesis, guidance) that carries a label. */
export function withoutClinicalLabels<T>(items: readonly T[], textOf: (item: T) => string): T[] {
  return items.filter((item) => !hasClinicalLabel(textOf(item)));
}

/** Hypotheses whose prediction and reasoning carry no clinical label. */
export function keepUnlabelledHypotheses<T extends { prediction: string; reasoning: string }>(
  hypotheses: readonly T[]
): T[] {
  return withoutClinicalLabels(hypotheses, (h) => `${h.prediction} ${h.reasoning}`);
}
