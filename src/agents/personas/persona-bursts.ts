/**
 * VOCAL_BURSTS_PER_PERSONA=on (off by default, #4218): each teammate is offered
 * only the vocal bursts that sound like them, a subset of BURSTS
 * (vocal-bursts.ts), and never a wince right before an answer the caller may
 * not want.
 *
 * Why: every persona was offered the same list, and "Eek," was labelled
 * "wincing at an awkward spot", which is exactly what an honest answer reads
 * like. On dev (2026-11-19) 3 of 5 candor calls opened the unwelcome answer
 * with "Eek,", twice as Alex with the same sentence. A friend's wince varies
 * and sounds like that person; a regular caller learned "Eek" means "here
 * comes the no".
 *
 * Each set below is read from the persona's canon in
 * src/personas/bundles/<id>/identity/ (character.md, voice-guidance.md); the
 * comment quotes the line it rests on. A persona with no entry (Ferni, Seth,
 * a custom agent) is offered every burst, as before.
 *
 * @module agents/personas/persona-bursts
 */

type Env = Record<string, string | undefined>;

export function perPersonaBurstsEnabled(env: Env = process.env): boolean {
  return env.VOCAL_BURSTS_PER_PERSONA === 'on';
}

/**
 * Burst ids (BURSTS in vocal-bursts.ts) each persona may be offered, by
 * canonical persona id.
 *
 * Ferni has no entry, so he keeps the full set. ferni/identity/character.md:
 * "Your mood follows the moment. Low-key by default. Quiet with someone who's
 * struggling, lighter when they're joking, genuinely delighted only when
 * something is delightful." Seth has none either. seth/identity/character.md:
 * "I love the little sounds."
 */
export const PERSONA_BURSTS: Readonly<Record<string, readonly string[]>> = {
  // alex-chen/identity/character.md: "Even and dry by default." His thinking
  // sound, voice-guidance.md: "Hmm." (thinking). His one signature laugh:
  // "[laughter]" (warm, real, especially for wins). Nothing else, so no "Eek,".
  'alex-chen': ['think', 'laugh'],
  // joel-dickson/identity/character.md: "You're bright, quick and warm, a little
  // nerdy, and you laugh easily because you genuinely find things delightful."
  'joel-dickson': ['surprise', 'chuckle', 'laugh'],
  // john-bogle/identity/character.md: "you own them with a dry smile" (chuckle);
  // "You're warm and grandfatherly" (tender); "Warm and unhurried by default"
  // (think); "you're slower up the stairs than you'd like" (sigh).
  'john-bogle': ['think', 'tender', 'chuckle', 'sigh'],
  // jordan-taylor/identity/voice-guidance.md signature sounds: "Oh!" (excited
  // recognition), "[laughter]" (frequent, warm, genuine). character.md: "playful
  // when they're joking"; "you can be soft just as easily" (tender).
  'jordan-taylor': ['surprise', 'tender', 'chuckle', 'laugh'],
  // maya-santos/identity/character.md: "warm and practical, quick to laugh,
  // honest about your own mess" (sheepish); "you don't gush either" (no tender).
  // voice-guidance.md signature sounds: "Oh!" (genuine recognition).
  'maya-santos': ['surprise', 'nervous', 'chuckle', 'laugh'],
  // nayan-patel/identity/voice-guidance.md signature sounds: "Hmm." (deep
  // consideration, used often), "[laughter]" (soft, knowing). character.md:
  // "You're calm, direct, and quietly funny."
  'nayan-patel': ['think', 'chuckle', 'laugh'],
  // peter-john/identity/voice-guidance.md signature sounds: "Oh!" (genuine
  // surprise), "Ha!" (delighted recognition). character.md: "you still get
  // nervous that a pattern you share might not hold" (sheepish); "you'll say
  // "I don't know" or "I'd want to check that"" (think).
  'peter-john': ['think', 'surprise', 'nervous', 'chuckle', 'laugh'],
};

/**
 * What this turn's stance fired (turn-candor.ts stanceFor, carried in the turn
 * shape's extras) when he is about to say what they may not want to hear:
 * they fished for a yes, or asked something nobody can know.
 */
const UNWELCOME_ANSWER = new Set(['candor_yes', 'candor_unknowable']);

/** A wince, in the per-persona invite: for their mishap, not his own honest answer. */
export const WINCE_FITS = 'wincing for them at a small mishap they just told you about';

/**
 * The bursts this persona may be offered on this turn: its own set (all of
 * `bursts` with no entry), without the wince on an unwelcome-answer turn, and
 * with the wince relabelled.
 */
export function personaBursts<B extends { id: string; fits: string }>(
  bursts: readonly B[],
  personaId: string | undefined,
  extras: readonly string[] = []
): B[] {
  const own =
    personaId !== undefined && Object.hasOwn(PERSONA_BURSTS, personaId)
      ? PERSONA_BURSTS[personaId]
      : null;
  const unwelcome = extras.some((e) => UNWELCOME_ANSWER.has(e));
  return bursts
    .filter((b) => (own === null || own.includes(b.id)) && !(unwelcome && b.id === 'wince'))
    .map((b) => (b.id === 'wince' ? { ...b, fits: WINCE_FITS } : b));
}
