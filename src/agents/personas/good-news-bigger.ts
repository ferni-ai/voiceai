/**
 * GOOD_NEWS_BIGGER (off by default): when the caller brings good news, the
 * persona answers it the way a delighted friend does.
 *
 * In real calls good news got flat replies ("Glad it went well", about 8 calls
 * in the 2026-10-18 friend review), and a dev check found 3 of 20 good-news
 * replies missed the news entirely. Capitalization research (Gable et al.,
 * 2004): an active-constructive answer to good news (enthusiastic, specific,
 * asking about it) builds closeness more than any answer to bad news.
 *
 * With the flag on, any persona speaking, on a turn the director's own
 * conservative reading calls good news (callerGoodNews, emotion-lift.ts: no
 * "but", nothing only hoped for, no sarcasm or irony, nothing heavy in the
 * caller's last three turns), the turn reminder gets one note: react first,
 * name the thing in their words, ask one question about the moment, no advice
 * and no pivot. The persona's own colour comes from its character sheet and,
 * with PERSONA_SPARK on, its spark sheet (character-spark.ts), so the note
 * says how to answer, never what to say. Never on a crisis-guided reply.
 *
 * TODO(wins-jar, CONCEPTS.md 2026-10-18): keep the win in the caller's own
 * words with a date, so a later call can bring it back. No wins store exists
 * yet, and the follow-through store holds things to check on, not wins.
 *
 * @module agents/personas/good-news-bigger
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { callerGoodNews } from '../../speech/tts-gateway/director/emotion-lift.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GoodNewsBigger' });

/**
 * The note for a good-news turn. Its example questions are marked as the
 * shape, never the words, since the model repeats examples word for word.
 */
export const GOOD_NEWS_NOTE =
  'They just told you good news. React first and for real, in your own voice, the way you light up, in words rather than a lone "Oh". ' +
  'Then name the exact thing they told you, in their words. ' +
  'Then ask one question about the moment itself, such as how they found out or who they told first; the shape, never the words. ' +
  'No advice, nothing about you, no logistics, and never a stock "glad to hear it". ' +
  'This one question stands even if a note above says no question.';

export function goodNewsBiggerOn(env: Env = process.env): boolean {
  return flagOn('GOOD_NEWS_BIGGER', env);
}

/**
 * The note for this reply, or ''. `callerTurns` are the caller's turns on this
 * call, oldest first, ending with the one this reply answers.
 */
export function goodNewsNote(
  said: string,
  callerTurns: readonly string[],
  opts: { crisis: boolean },
  env: Env = process.env
): string {
  if (opts.crisis || !said || !goodNewsBiggerOn(env)) return '';
  if (!callerGoodNews(said, callerTurns.slice(0, -1))) return '';
  log.info({ behaviour: 'good_news_bigger' }, 'Good-news note added to the turn reminder');
  return GOOD_NEWS_NOTE;
}
