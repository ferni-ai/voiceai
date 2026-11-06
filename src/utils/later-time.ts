/**
 * The later time a call or text is set for, in words: "at eight", "8:30pm",
 * "tonight", "in two hours", "tomorrow morning", "when she gets home". Never
 * "now", "in a minute", "in ten minutes" or "right away": a call placed that
 * soon keeps those (ten minutes or less is near enough to now), and never an
 * address ("she's at 4 Elm Road").
 *
 * A time inside the words being carried is the message, not when it goes:
 * "text her that dinner's at eight", "say you land at 6pm", a quote. Those
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
/** More than ten minutes: ten or fewer is near enough to now that a call placed now keeps it. */
const MINUTES =
  '(?:[1-9]\\d{2,}|1[1-9]|[2-9]\\d|eleven|twelve|fifteen|(?:twenty|thirty|forty|fifty)(?:(?:-| )(?:five|one|two|three|four|six|seven|eight|nine))?|sixty|ninety)';
/** A street after a number: "at 4 Elm Road" is where she is, not when. */
const STREET =
  '(?:\\s+[a-z]+){1,2}\\s+(?:road|rd|street|st|avenue|ave|lane|ln|drive|dr|way|court|ct|boulevard|blvd|place|pl|circle|terrace|parkway|highway|hwy)\\b';
/** "half past eight", "quarter to nine", "ten past six". */
const PAST_TO = `(?:half|(?:a )?quarter|five|ten|twenty(?:-| )five|twenty|\\d{1,2}) (?:past|to|after) ${CLOCK}\\b`;
const WEEKDAY = '(?:mon|tues|wednes|thurs|fri|satur|sun)day';

const LATER = new RegExp(
  [
    // "at eight", "at 8:30", "at 8 pm", "at six thirty"; not "at one point", "at 555 0142" or "at 4 Elm Road"
    `\\b(?:at|around|by) ${CLOCK}(?![\\d:])(?:\\s*${MERIDIEM}|\\s+(?:thirty|fifteen|forty(?:-| )five)\\b)?(?!\\s+(?:point|of|another|time|percent|minutes?|years?)\\b|${STREET})`,
    `\\b(?:at|around|by) ${PAST_TO}`,
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
  /\b(?:that|say\w*|said|tell\w*|let\w* (?:her|him|them|\w+) know|ask\w*|about|remind\w* (?:her|him|them)|(?:it|dinner|lunch|breakfast|the \w+)(?:'s| is| starts?| begins?))\b.*$/i;

/** The later time `text` sets its call or text for, as said ("at eight", "tonight"), or undefined. */
export function laterTime(text: string): string | undefined {
  const plain = text.replace(/[‘’]/g, "'").replace(QUOTED, ' ').replace(CARRIED, '');
  return LATER.exec(plain)?.[0];
}
