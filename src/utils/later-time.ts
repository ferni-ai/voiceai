/**
 * The later time a call or text is set for, in words: "at eight", "8:30pm",
 * "tonight", "in two hours", "tomorrow morning", "when she gets home". Never
 * "now", "in a minute" or "right away": a call placed now keeps those.
 *
 * A time inside the words being carried is the message, not when it goes:
 * "text her that dinner's at eight", "tell him I land at 6pm", a quote. Those
 * are cut before the time is read.
 *
 * Read by the action-claim guard, so a call promised "at eight" on a read-back
 * that dials now doesn't stand (agents/personas/action-promises.ts).
 *
 * @module utils/later-time
 */

const CLOCK =
  '(?:\\d{1,2}(?::\\d{2})?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const MERIDIEM = "(?:[ap]\\.m\\.|[ap]m\\b|o'?clock\\b)";
const HOURS = '(?:\\d+|an?|one|two|three|four|five|six|ten|twelve|a few|a couple(?: of)?|half an?)';
const MINUTES =
  '(?:\\d{2,}|[2-9]|two|three|four|five|ten|fifteen|twenty|thirty|forty(?:-| )five|a few|a couple(?: of)?)';
const WEEKDAY = '(?:mon|tues|wednes|thurs|fri|satur|sun)day';

const LATER = new RegExp(
  [
    // "at eight", "at 8:30", "at 8 pm", "at six thirty"; not "at one point", not "at 555 0142"
    `\\b(?:at|around|by) ${CLOCK}(?![\\d:])(?:\\s*${MERIDIEM}|\\s+(?:thirty|fifteen|forty(?:-| )five)\\b)?(?!\\s+(?:point|of|another|time|percent|minutes?|years?)\\b)`,
    `\\b${CLOCK}\\s*${MERIDIEM}`, // "8pm", "eight p.m.", "eight o'clock"
    `\\b(?:tonight|tomorrow|tmrw|later(?! than)|this (?:evening|afternoon|weekend)|in the (?:morning|evening|afternoon)|first thing|next (?:week|month|${WEEKDAY})|(?:on |this )?${WEEKDAY}s?)\\b`,
    '\\b(?:at|around|by|after|before) (?:noon|midnight|lunch(?:time)?|dinner(?:time)?|bedtime)\\b',
    // "after work", never "at work": that is where, not when
    '\\b(?:after|before) (?:work|school|class|church|(?:her|his|their) shift)\\b',
    `\\bin ${HOURS} (?:more )?(?:hours?|hrs?|days?|weeks?)\\b`,
    `\\bin ${MINUTES} (?:more )?(?:minutes?|mins?)\\b`,
    // "when she's up", "once he gets home"
    "\\b(?:when|once) (?:she|he|they)(?:'s|'re| is| are| gets?| comes?| wakes?)(?: up| home| back| off| free| done| in)\\b",
  ].join('|'),
  'i'
);

/** Quoted words: what is said, never when. */
const QUOTED = /["“][^"”]*["”]/g;
/** From where the carried words start: "that ...", "tell her ...", "dinner's at eight". */
const CARRIED =
  /\b(?:that|saying|says|tell\w*|let\w* (?:her|him|them|\w+) know|ask\w*|about|remind\w* (?:her|him|them)|(?:it|dinner|lunch|breakfast|the \w+)(?:'s| is| starts?| begins?))\b.*$/i;

/** The later time `text` sets its call or text for, as said ("at eight", "tonight"), or undefined. */
export function laterTime(text: string): string | undefined {
  const plain = text.replace(/[‘’]/g, "'").replace(QUOTED, ' ').replace(CARRIED, '');
  return LATER.exec(plain)?.[0];
}
