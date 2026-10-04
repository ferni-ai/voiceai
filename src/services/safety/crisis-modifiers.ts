/**
 * Context that softens explicit crisis language (negation, a joke, the past,
 * a condition, someone else's words), and the text normalisation the
 * patterns are written against.
 *
 * @module CrisisModifiers
 */

/** Explicit language softened by a joke. Still a crisis; not a scripted takeover. */
const JOKE_MARKERS =
  /\b(lol+|lmao+|lmfao|rofl|haha+|hehe|jk|just kidding)\b|[\u{1F602}\u{1F923}\u{1F480}\u{1F605}]/u;

/** A negator governing the matched phrase: "I don't want to die", "I'm not going to...". */
const NEGATION_PREFIX =
  /\b(don'?t|do not|didn'?t|never|not|wouldn'?t|won'?t|no longer|isn'?t|ain'?t)\s+((really|actually|even|ever|honestly|necessarily|going|gonna|planning|plan|to|on|saying|say|that|i|would|want|wanna)\s+)*$/;

/**
 * Blames an outside thing in the same breath: "my team is so bad I want to
 * unalive myself", like "this traffic makes me want to die". "I'm so sad I
 * want to die" does not match: the subject has to be something other than me.
 */
const HYPERBOLE_PREFIX =
  /\b(this|that|my|the|it'?s|it is|he'?s|she'?s|they'?re|[a-z]+ (is|are|was|were)) (\w+ )?(so|too) (bad|boring|annoying|cringey?|embarrassing|awful|slow|long|hard|dumb|stupid|terrible|loud|laggy|toxic)( that)? i $/;

/** Places the matched phrase in the past. */
const HISTORY_MARKERS =
  /\b(used to|(\w+ )?(years?|months?) ago|(in|back in|since) (19|20)\d\d|last (year|month|summer|spring|fall|winter)|when i was (a kid|little|younger|a teen(ager)?|in (middle school|high school|college))|back (then|in (high school|college|the day))|in (middle school|high school|college)|as a (kid|teen(ager)?)|in the past|a few years back)\b/;

/** The past is coming back: recovery language no longer softens it to distress. */
const RECURRENCE_MARKERS =
  /\b(again|lately|these days|recently|tonight|today|right now|coming back|creeping back|still)\b/;

/** Frequency or partial hedges: ideation without stated intent ("sometimes I think..."). */
const HEDGE_PREFIX =
  /\b(sometimes|some days|part of me|every now and then|occasionally|at times)\b/;

/** Stated protection against acting ("...but I don't have a plan"). */
const PROTECTIVE_MARKERS =
  /\b(don'?t|do not|wouldn'?t|won'?t|would never|will never) (have a plan|act on (it|them)|do (it|anything)|go through with it)\b|\bno plan\b|\bnot going to act on\b/;

/** History told as recovery: "I used to self-harm but I'm two years clean". */
const RECOVERY_MARKERS =
  /\b(clean|sober|recovered|in recovery|better now|doing (better|well|good)|proud|got help|haven'?t (done|felt) (that|it|this)|i don'?t (do (that|it) )?anymore)\b/;

/**
 * Someone else is the speaker or the source of the words that follow:
 * "my brother said he's thinking about ending it", "her journal about wanting
 * to die". Only applies when no first-person word comes after it.
 */
const THIRD_PERSON_SOURCE =
  /\b(he|she|they)('s|'re| is| are| was| were| has| have| keeps?| kept| said| says| told| wants?| texted| posted| wrote)\b|\b(said|says|told me|texted|wrote|posted)\b|\b(his|her|their) (journal|diary|notes?|texts?|messages?|posts?|letter|search history)\b/g;

const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|me|my|myself)\b/;

const CLAUSE_BREAK = /[.!?;,]|\bbut\b|\band\b/;

/** Spoken and texted shorthand, so patterns can be written once in full form. */
const SHORTHAND: [RegExp, string][] = [
  [/\bgonna\b/g, 'going to'],
  [/\bwanna\b/g, 'want to'],
  [/\brn\b/g, 'right now'],
  [/\bim\b/g, "i'm"],
  [/\bive\b/g, "i've"],
  [/\b(he|she)s\b/g, "$1's"],
  [/\bid\b(?= (rather|be|have|never|just))/g, "i'd"],
  [/\b(don|can|won|didn|doesn|isn|wasn|wouldn|couldn|shouldn|haven|hasn|ain)t\b/g, "$1't"],
  [
    /\b(what|that|there|it)s\b(?= (the|even|no|not|going|been|a|all|over|happening|fine|okay))/g,
    "$1's",
  ],
];

export function normalize(message: string): string {
  let text = message
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, full] of SHORTHAND) text = text.replace(re, full);
  return text;
}

type ExplicitModifier =
  | 'negated'
  | 'hyperbole'
  | 'recovered'
  | 'history'
  | 'joking'
  | 'conditional'
  | 'hedged'
  | 'protective'
  | 'third_party'
  | null;

/** True when the words right before the match attribute them to someone else. */
function attributedToOther(prefix: string, matched: string): boolean {
  if (FIRST_PERSON.test(matched)) return false;
  let lastEnd = -1;
  for (const m of prefix.matchAll(THIRD_PERSON_SOURCE)) lastEnd = (m.index ?? 0) + m[0].length;
  return lastEnd >= 0 && !FIRST_PERSON.test(prefix.slice(lastEnd));
}

/** How the clause around an explicit match softens it, if at all. */
export function explicitModifier(
  text: string,
  start: number,
  end: number,
  imminent: boolean
): ExplicitModifier {
  const clauseStart = text.slice(0, start).split(CLAUSE_BREAK).pop() ?? '';
  const prefix = clauseStart.trim().length > 0 ? `${clauseStart.trim()} ` : '';
  const suffix = text.slice(end).split(/[.!?;,]|\bbut\b/)[0] ?? '';
  if (attributedToOther(prefix, text.slice(start, end))) return 'third_party';
  if (NEGATION_PREFIX.test(prefix)) return 'negated';
  if (HYPERBOLE_PREFIX.test(` ${text.slice(0, start).replace(/\s+$/, '')} `)) return 'hyperbole';
  if (HISTORY_MARKERS.test(`${prefix}${text.slice(start, end)}${suffix}`)) {
    return RECOVERY_MARKERS.test(text) && !RECURRENCE_MARKERS.test(text) ? 'recovered' : 'history';
  }
  if (JOKE_MARKERS.test(text)) return 'joking';
  // A conditional before the words ("if one more thing goes wrong I'll kms")
  // does not soften an imminent statement ("if you don't hear from me, I took
  // the pills").
  if (/\bif\b/.test(suffix) || (!imminent && /\bif\b/.test(prefix))) return 'conditional';
  if (HEDGE_PREFIX.test(prefix)) return 'hedged';
  if (PROTECTIVE_MARKERS.test(text.slice(end))) return 'protective';
  return null;
}
