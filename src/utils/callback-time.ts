/**
 * "Call me later" is a callback request, never a name (CALL_ME_VOCATIVE=on).
 *
 * After "call me", the words that follow are a time as often as a name:
 * "call me in five minutes", "call me later", "call me tomorrow", "call me
 * at 5", "call me back", "call me in an hour". A capitalised "Later" or
 * "Tomorrow" from speech-to-text passes the name checks in
 * agents/personas/name-correction.ts, and the model can hand the same words
 * to rememberName (tools/domains/conversation/remember-name.ts). This says
 * whether a would-be name is such a time, so neither path takes it.
 *
 * @module utils/callback-time
 */

/** A one-word time or a word from a time phrase, any case. */
const TIME_WORD = new RegExp(
  '^(?:' +
    'later|tomorrow|tonight|today|soon|back|again|now|asap|sometime|anytime|noon|midnight|' +
    'morning|afternoon|evening|weekend|minutes?|mins?|hours?|hrs?|seconds?|secs?|' +
    'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|' +
    'forty|fifty|sixty|half|quarter|couple|few' +
    ')$',
  'i'
);

/** A time phrase: a digit, a clock or duration word, or a lead-in like "in", "at", "after". */
const TIME_PHRASE =
  /\d|\b(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|o['’]?clock|a\.?m\.?|p\.?m\.?)(?![\p{L}])|^(?:in|at|after|before|around|by|next|this|on|until|later|tomorrow|tonight)\b/iu;

/** Whether `text`, given where a name was expected, is a callback time instead ("later", "in an hour"). */
export function isCallbackTime(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return TIME_WORD.test(t) || TIME_PHRASE.test(t);
}
