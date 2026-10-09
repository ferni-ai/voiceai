/**
 * Backchannels that fit what the caller is saying (BACKCHANNEL_CONTEXT=on).
 *
 * A listener's "mm-hm" reacts to the content: "oh no" to bad news, "whoa" to
 * a surprise, "ha" to something funny, "yeah" to a point they're making, and
 * "mm-hm" to a story still going on. pickBackchannel (backchannel-policy.ts)
 * draws from a neutral pool; this picks from the pool that fits the caller's
 * latest words, or returns null so the caller falls back to that neutral pick.
 *
 * Every phrase here must be pre-rendered for the persona (BACKCHANNELS in
 * conversational-audio-cache.ts): a clip plays only if its exact text is cached.
 *
 * @module agents/integrations/backchannel-context
 */

type Env = Record<string, string | undefined>;

export function backchannelContextEnabled(env: Env = process.env): boolean {
  return env.BACKCHANNEL_CONTEXT === 'on';
}

export type BackchannelContext =
  'bad_news' | 'tender' | 'surprise' | 'funny' | 'agreement' | 'narrative';

/**
 * Cues per category, matched as whole words or whole-word phrases. Ordered by
 * priority: an upbeat "whoa" to bad news is the worst miss, so bad news wins.
 * Slang that flips meaning ("that's sick", "I'm dead") is left out.
 */
const CUES: ReadonlyArray<[BackchannelContext, readonly string[]]> = [
  [
    'bad_news',
    [
      'died',
      'passed away',
      'funeral',
      'cancer',
      'diagnosed',
      'got fired',
      'laid off',
      'lost my job',
      'divorce',
      'broke up',
      'dumped',
      'hospital',
      'accident',
      'miscarriage',
      'terrible',
      'awful',
      'horrible',
      'bad news',
      'devastated',
      'heartbroken',
      'sad',
      'sadly',
      'injured',
      'robbed',
      'stolen',
      // Everyday mishaps and hard days: what callers actually report (dev evals,
      // 2026-10-09: a spilled glass, a chewed charger and a long day got nothing).
      'long day',
      'hard day',
      'rough day',
      'bad day',
      'exhausted',
      'stressed',
      'overwhelmed',
      'deadline',
      'chewed',
      'spilled',
      'knocked',
      'dropped',
      'smashed',
      'cracked',
      'ruined',
      'burned',
      'burnt',
      'flat tire',
      'locked out',
      'missed my',
      'lost my',
      'sick',
      'worst',
    ],
  ],
  [
    'tender',
    ['crying', 'cried', 'tears', 'teared up', 'choked up', 'so happy', 'so proud', 'emotional'],
  ],
  [
    'surprise',
    [
      'suddenly',
      'all of a sudden',
      'out of nowhere',
      'out of the blue',
      'turns out',
      'turned out',
      'believe it or not',
      "can't believe",
      "you won't believe",
      'guess what',
      'unbelievable',
      'shocked',
      'surprised',
      'insane',
      'engaged',
      'proposed',
      'pregnant',
      'got married',
      'won',
      'quit',
    ],
  ],
  [
    'funny',
    [
      'funny',
      'hilarious',
      'ridiculous',
      'absurd',
      'joke',
      'jokes',
      'joking',
      'kidding',
      'cracked up',
      'haha',
      'hahaha',
      'lol',
      'lmao',
      'laughing',
      'on purpose',
      'plotting',
      'dead in the eye',
      'looked me',
      'revenge',
      'sabotage',
      'chaos',
      'typical',
      'classic',
    ],
  ],
  [
    'agreement',
    [
      // Not fillers like "honestly" or "you know": "I honestly started crying"
      // got "Right".
      'obviously',
      'of course',
      'exactly',
      'totally',
      'makes sense',
      'the thing is',
      'to be fair',
    ],
  ],
  ['narrative', ['then', 'anyway', 'anyways', 'after that', 'next thing', 'meanwhile', 'later on']],
];

/** A cue right after one of these is negated ("not funny", "wasn't terrible"). */
const NEGATORS = new Set([
  'not',
  'never',
  "isn't",
  "wasn't",
  "aren't",
  "weren't",
  "don't",
  "didn't",
  'hardly',
]);

/** Only the caller's latest words count: the start of a long turn has moved on. */
const WINDOW_WORDS = 12;

/** What each category says back. Every phrase must be in ferni's BACKCHANNELS. */
export const REACTIONS: Readonly<Record<BackchannelContext, readonly string[]>> = {
  bad_news: ['Oh no', 'Oof', 'Mm'],
  tender: ['Aw', 'Mm'],
  surprise: ['Whoa', 'No way', 'Oh'],
  funny: ['Ha'],
  agreement: ['Yeah', 'Right'],
  narrative: ['Mm-hmm', 'Mhm'],
};

/** In an emotional moment only these: a "whoa" or "ha" there jars. */
const SOFT = new Set(['Mm', 'Mhm', 'Mm-hmm', 'Aw']);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function hasCue(tokens: readonly string[], cue: string): boolean {
  const parts = cue.split(' ');
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    if (parts.every((p, j) => tokens[i + j] === p) && !NEGATORS.has(tokens[i - 1] ?? '')) {
      return true;
    }
  }
  return false;
}

/** The category of the caller's latest words, or null when none clearly fits. */
export function classifyBackchannelContext(partialTranscript: string): BackchannelContext | null {
  const tokens = words(partialTranscript).slice(-WINDOW_WORDS);
  for (const [category, cues] of CUES) {
    if (cues.some((cue) => hasCue(tokens, cue))) return category;
  }
  return null;
}

/**
 * A phrase that fits the caller's latest words, never `last`, and only a soft
 * sound in an emotional moment. Null when nothing fits: the caller then uses
 * pickBackchannel. Draws from `random` only when it returns a phrase.
 */
export function pickContextualBackchannel(
  partialTranscript: string,
  emotional: boolean,
  last: string | null,
  random: () => number = Math.random
): string | null {
  const category = classifyBackchannelContext(partialTranscript);
  if (category === null) return null;
  const pool = REACTIONS[category].filter((p) => p !== last && (!emotional || SOFT.has(p)));
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}
