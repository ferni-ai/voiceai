/**
 * The last-call summary's fallback: what the caller said, never their filler.
 *
 * Prod 2026-10-17: the after-call LLM summary often kept no key points once #1469
 * required every word of one to be the caller's. The background summarizer then
 * wrote its fallback, the caller's last three lines, over the profile, and the next
 * call opened on "Last time: Discussed: Yep; Just checking you out". Backchannels,
 * greetings and test lines say nothing about a call, so they are dropped here. A call
 * with nothing else gets no quote summary at all ('').
 *
 * @module services/memory/call-summary-fallback
 */

/** A turn of any shape that carries a speaker and their words. */
export interface SpokenLine {
  role: string;
  content: string;
}

/** Words that never carry what a call was about on their own. */
const FILLER_WORDS = new Set(
  (
    'yep yeah yes yup ya yah ok okay k mm mmm mhm mhmm mmhm mmhmm hmm hmmm hm um umm uh uhh huh uhhuh ' +
    'ah oh sure right alright cool nice great good fine thanks thank you bye goodbye hi ' +
    'hello hey there no nope nah so well just'
  ).split(' ')
);

/** Lines callers say to poke at the app, not to tell Ferni anything. */
const FILLER_PHRASES = [
  'just checking you out',
  'checking you out',
  'just checking',
  'just testing',
  'testing',
  'test',
  'can you hear me',
  'are you there',
  'never mind',
  'nevermind',
];

/** True when a caller's line is only backchannel, greeting or test talk ("Yep", "Mm-hmm."). */
export function isFillerLine(line: string): boolean {
  let text = ` ${line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()} `;
  for (const phrase of FILLER_PHRASES) text = text.split(` ${phrase} `).join(' ');
  return text
    .split(' ')
    .filter(Boolean)
    .every((word) => FILLER_WORDS.has(word));
}

/**
 * "Discussed: …" from the caller's last three lines that say something, or '' when
 * every line was filler. Only for when no LLM summary exists.
 */
export function fallbackCallSummary(turns: readonly SpokenLine[], maxChars = 60): string {
  const said = turns.filter((t) => t.role === 'user' && !isFillerLine(t.content));
  if (said.length === 0) return '';
  const topics = said.slice(-3).map((t) =>
    t.content
      .slice(0, maxChars)
      .replace(/[.!?]+$/, '')
      .trim()
  );
  return `Discussed: ${topics.join('; ')}`;
}
