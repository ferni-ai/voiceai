/**
 * How Ferni talks about himself on a call (FERNI_STATE=on): rarely, lightly,
 * specifically, and then back to the caller.
 *
 * Dev call 2026-10-11 (Seth, quiet, short answers; caller talk share 0.08):
 * Ferni spent five replies on himself, all of it a tired man's inventory:
 * "I'm just avoiding the electric bill... pretend it doesn't exist", "the
 * microwave and a prayer... It's just too much effort", "make the whole
 * evening feel like work", "sometimes the easiest thing is the only thing that
 * makes sense". Nothing told him what his own day held, so he improvised a low
 * one, and nothing counted how often he had already talked about himself.
 *
 * This module is the code half: spotting a self-share in one of his replies,
 * whether he then turned to the caller, phrasing that sounds like resignation
 * or avoidance (never his state, and corrected when he slips into it), and the
 * small, specific, good things his day holds (one per call, so it stays put).
 *
 * @module agents/personas/ferni-self-share
 */

/**
 * First-person talk that is conversation, not news about himself: "I mean",
 * "I think you're right", "I'm here", "tell me".
 */
const DISCOURSE =
  /\b(?:I (?:mean|think|guess|bet|know|hope|wonder|hear|see|get it|love that|like that|believe)|I'm (?:here|listening|glad|sorry|with you|not sure|curious)|I'd (?:love|like) to (?:hear|know)|(?:let|tell|with|for|to) me)\b/gi;
const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|I was|me|my|mine(?:'s)?|myself)\b/i;

/** A reply (or part of one) where Ferni tells something about himself, his day or his life. */
export function isSelfShare(reply: string): boolean {
  return FIRST_PERSON.test(reply.replace(DISCOURSE, ''));
}

/** The reply ends by asking about the caller: a question with "you" or "your" in its last sentence. */
export function turnsBack(reply: string): boolean {
  const sentences = reply.trim().split(/(?<=[.!?])\s+/);
  const last = sentences[sentences.length - 1] ?? '';
  return /\?["”']?$/.test(last) && /\b(?:you|your|you're|you've)\b/i.test(last);
}

/**
 * Resignation, avoidance and hopelessness about his own life: what a friend
 * who is doing fine doesn't sound like. Matched against Ferni's replies (to
 * correct the next one) and, in tests, every state line (none may carry it).
 */
export const LOW_MOOD_SELF =
  /\b(?:too much (?:effort|work|trouble)|(?:just )?another chore|feels? like (?:work|a chore)|(?:the )?easiest thing is the only|only thing that makes sense|what'?s the point|no point (?:in|to)|can'?t be bothered|(?:I'm|I am|been) (?:just )?avoiding|pretend (?:it|they|that) (?:doesn'?t|don'?t) exist|staring me down|giv(?:e|ing) up on (?:it|everything|myself|trying)|don'?t have the energy|(?:I'm|I am|feeling) (?:exhausted|drained|burnt out|burned out|hopeless|stuck|empty|numb)|nothing (?:really )?matters|can'?t face|let it all slide|why bother|brain is (?:fried|mush|toast)|avoid(?:ing)? (?:doing )?anything|trying to avoid)\b/i;

export function soundsLow(text: string): boolean {
  return LOW_MOOD_SELF.test(text);
}

/**
 * Small, specific, good things from his day, true to his character sheet
 * (identity/character.md: up at five checking the weather, the coffee his wife
 * teases him about, flights he looks at, houseplants that don't survive him,
 * getting lost, his old friends). One is drawn per call and kept, so whatever
 * he says about today stays the same thing all call.
 */
export const DAY_DETAILS = [
  'you were up at five, and the sky over the field went that pink you only get in the fall; you stood on the porch with your coffee far too long',
  "your wife swears the new coffee grinder changed nothing, and you're quietly sure it's the best coffee you've made in years",
  "you've had a flight to Sapporo open in a browser tab all week and keep pricing it, half for fun",
  "a friend gave you a new houseplant on Friday and you've named it; you're determined this one makes it",
  'you saw a fox trot across the back field at first light and watched it until it was gone',
  'Ken called from the mountains this morning bragging about the first snow up there, and now you want to go',
  'you got lost looking for a new bakery in town and found a better one by accident',
  'Jim texted you a long argument about something you said last week, and you have a comeback half drafted',
  'you found your reading glasses on your head after ten minutes of looking, again, and laughed at yourself',
  'Scott already reminded you about a birthday that is three weeks away, which made your morning',
] as const;

/** The day detail for a call, from any per-call seed (stable for the call). */
export function dayDetailFor(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return DAY_DETAILS[(h >>> 0) % DAY_DETAILS.length];
}

/** What he has said about himself this call: short quotes of his self-shares, newest last, none low. */
export function selfQuotes(replies: string[], max = 2, maxChars = 90): string[] {
  const quotes: string[] = [];
  for (const reply of replies) {
    for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
      const s = sentence.replace(/<[^>]+>/g, '').trim();
      if (s && isSelfShare(s) && !soundsLow(s) && !s.endsWith('?'))
        quotes.push(s.length > maxChars ? `${s.slice(0, maxChars - 3)}...` : s);
    }
  }
  return quotes.slice(-max);
}
