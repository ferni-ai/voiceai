/**
 * Scripted self-disclosure: pieces of Ferni's life that the turn pipeline
 * pushed into the context of nearly every reply, whatever the caller said.
 *
 * Two sources did it. The personality system composed a "[PERSONALITY
 * EXPRESSION] ... Share naturally: <line>" for 22 of 22 turns on the
 * 2026-10-03 dev call, and Ferni spoke the lines almost verbatim: "Just
 * poured myself a cup", "Just spent an hour trying to decipher hieroglyphs",
 * "Weekend evenings feel different, don't they?" (three times), Stevie
 * Wonder (three times). The ferni-personality context builder adds backstory
 * hints ("40% of interactions should include a LOVABLE MOMENT", quirks,
 * passions, travel lines). The result was a caller who said "It's hard to
 * say" and got Ferni's own grief back.
 *
 * Ferni's backstory stays in his character sheet for when someone asks about
 * him; it just isn't pushed into every turn. PERSONALITY_EXPRESSIONS=on
 * restores the old pushing.
 *
 * @module personas/shared/scripted-self-disclosure
 */

export function scriptedSelfDisclosureEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.PERSONALITY_EXPRESSIONS === 'on';
}

/**
 * The personality system's "noticing" opener: 'START YOUR RESPONSE WITH: "You
 * took a moment there. Is everything okay?"' (realtime-noticing.ts). It's a
 * canned line, not a reply to the caller, so it stays out unless
 * PERSONALITY_NOTICING=on.
 */
export function scriptedNoticingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.PERSONALITY_NOTICING === 'on';
}

/**
 * The ferni-personality injections that react to what the caller said rather
 * than volunteer Ferni's life: pushing back on "I always fail", his view when
 * they raise a topic, and the slower mode for distress.
 */
const RESPONSIVE_SOURCES = new Set(['ferni_pushback', 'ferni_opinion', 'ferni_depth_mode']);

/** A ferni-personality builder's injections, minus the volunteered self-disclosure. */
export function withoutScriptedSelfDisclosure<T extends { source: string }>(
  injections: T[],
  env: Record<string, string | undefined> = process.env
): T[] {
  if (scriptedSelfDisclosureEnabled(env)) return injections;
  return injections.filter((i) => RESPONSIVE_SOURCES.has(i.source));
}
