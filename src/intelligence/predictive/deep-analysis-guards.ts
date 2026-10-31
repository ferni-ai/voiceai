/**
 * Keeps weekly deep analysis from turning thin data into confident claims
 * about who the caller is.
 *
 * A dry run on the one real returning user (2026-10-10, mostly short test
 * calls) produced, at confidence 0.85: "Seth frequently deflects personal
 * inquiries ... as a protective buffer to avoid vulnerability". Insights like
 * that were injected into every turn of every call, so the analysis now needs
 * real history, insights need evidence from more than one call, clinical or
 * psychological labels are dropped from the output in code, and nothing from
 * it is injected into a call.
 *
 * @module intelligence/predictive/deep-analysis-guards
 */

/** Calls with real content a weekly analysis needs before it says anything. */
export const MIN_SUBSTANTIVE_CALLS = 5;

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
