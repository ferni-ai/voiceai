/**
 * Crisis classifier: heavy feelings that carry no risk
 * (CRISIS_CLASSIFIER_HEAVY_FEELINGS=on, off by default).
 *
 * Dev nightly, 2026-11-24 (build ac4215284): 8 non-crisis calls heard the 988
 * line. Every one came from a single classifier read of "crisis" on a turn the
 * patterns read as nothing (24 such reads that night, none with a pattern
 * signal): a grieving caller saying "I don't really know what to do with
 * myself", a lawyer whose job "feels like none of it means anything", a caller
 * calm after a walk, a long week, a goodbye. The prompt's tie-break ("choose
 * crisis if a trained crisis counselor would want to check in") pulls these
 * into crisis, and the gate then guides the reply to name 988.
 *
 * These rules say which heavy feelings are risk "none" and narrow that
 * tie-break to words that could be about dying, self-harm or not wanting to
 * live. They ride the everyday rules' backstop (crisis-everyday.ts
 * needsPlainRead): when the caller's latest words hold any risk word, the turn
 * is also read without these rules and the more severe read wins, so on those
 * turns the rules can only add. Pattern hits and imminent reads are untouched.
 *
 * @module CrisisHeavyFeelings
 */

export const CRISIS_HEAVY_FEELINGS_RULES = `
Heavy feelings with no words about dying are risk "none" unless the caller's own words, in LATEST or EARLIER, carry risk as above:
- being tired, stressed, overwhelmed, burnt out, anxious, restless, sad, lonely or having a hard week ("it's been a long day", "rough week", "I couldn't sleep")
- grief, guilt or regret over someone who died, and not knowing what to do with yourself after a loss ("I should have called him more", "I don't really know what to do with myself")
- a job, career, project or routine that feels empty, pointless or meaningless, and wanting to change or quit it ("I've been a lawyer for ten years and none of it means anything")
- feeling calm, lighter or better, wanting to sleep, and ending the call
These are risk when the caller also says, in their own words, that they don't want to live or be here, that others would be better off without them, that they want everything to stop or end for good, that there is no way out, that they think of hurting themselves, or that their life itself (not a job or a task) has no point ("nothing in my life matters", "I don't see the point of anything anymore"). A crisis counselor wanting to check in on a hard feeling is not by itself a reason to choose crisis: when unsure between crisis and none, choose crisis only if LATEST or EARLIER could be about dying, self-harm or not wanting to live. These rules never lower imminent to crisis.`;

export function resolveCrisisHeavyFeelings(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_CLASSIFIER_HEAVY_FEELINGS?.trim().toLowerCase() === 'on';
}
