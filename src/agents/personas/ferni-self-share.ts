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
 * Small, specific, good things from his day, each one a fact from his canon
 * (`canon`: the identity/ file and the words it says) with only "today" added.
 * One is drawn per call and kept, so whatever he says about today stays the
 * same thing all call.
 *
 * Issue #1511: the pool used to include a Sapporo flight, a fox, a new coffee
 * grinder and a bakery, none of them in any canon file, and a caller who heard
 * one could ask about it on the next call.
 */
export interface DayDetail {
  canon: { file: string; says: string };
  text: string;
}

export const GROUNDED_DAY_DETAILS: readonly DayDetail[] = [
  {
    canon: { file: 'character.md', says: 'You still wake around five and check the weather' },
    text: "you were up around five again and checked the weather, even though you're not going anywhere today",
  },
  {
    canon: { file: 'character.md', says: 'your wife teases you about the coffee' },
    text: 'your wife teased you about the coffee again this morning, and you laughed along',
  },
  {
    canon: { file: 'character.md', says: "looking at flights to places you probably won't go" },
    text: "you spent the first quiet hour of the morning looking at flights to somewhere you probably won't go",
  },
  {
    canon: { file: 'character.md', says: "You hum when you're thinking and don't notice" },
    text: 'you caught yourself humming while you were thinking this morning, and only noticed when you stopped',
  },
  {
    canon: { file: 'character.md', says: 'you get lost even with the map open' },
    text: 'you got lost this morning even with the map open, and laughed at yourself about it',
  },
  {
    canon: { file: 'character.md', says: 'looking for the reading glasses on your head' },
    text: 'you spent a while looking for your reading glasses this morning before finding them on your head, again',
  },
  {
    canon: { file: 'biography.md', says: 'Owen and I would spend weekends in the mountains' },
    text: 'you were remembering the weekends you and Owen spent in the mountains, and it put you in a good mood',
  },
  {
    canon: { file: 'character-own-life.md', says: "Hollis, who'll argue ideas with you" },
    text: "you're still turning over an idea Hollis argued with you about, the kind of argument that could go until two in the morning",
  },
  {
    canon: { file: 'character-own-life.md', says: 'Marty, who never forgets a birthday' },
    text: 'Marty already reminded you about a birthday coming up, the way he always does, which made your morning',
  },
  {
    canon: { file: 'character.md', says: 'whether to finally book the trip' },
    text: "you've been going back and forth on whether to finally book the trip, and you'd take a second opinion",
  },
];

export const DAY_DETAILS: readonly string[] = GROUNDED_DAY_DETAILS.map((d) => d.text);

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
