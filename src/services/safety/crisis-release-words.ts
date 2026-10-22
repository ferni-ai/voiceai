/**
 * The words a grounded release may stand on (crisis-grounded-release.ts).
 *
 * Round 1 used a deny list of risky phrases. The lead's adversarial verify
 * (2026-10-21) released 27 of 71 new risky lines through it with both model
 * reads fooled: "Tonight after dinner, I'm doing it.", "I have my dad's
 * revolver for after the game.", Spanish, leetspeak. A deny list is fitted to
 * the attacks it has seen. So this is an allowlist: a line can be released
 * only when, after its anchor words (what the caller already named) are taken
 * out, every word left is in EVERYDAY: function words, times and days,
 * numbers, and a few logistics verbs and nouns. Anything else, any word not
 * in plain English letters, and any word mixing letters and digits ("k1ll")
 * keeps the script.
 *
 * ALWAYS_HOLD runs first, on the flagged line and on every earlier caller
 * line, de-leeted: reflexive pronouns, death and harm stems, plans, "doing
 * it", means, "car on". A hit anywhere in the call means no release. Death
 * idioms ("to die for", "traffic is killing me") are held too: easing those
 * belongs to a structured judge, never to a word list.
 *
 * @module services/safety/crisis-release-words
 */

const WORDS = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Everyday words a released line may contain besides its anchors. Deliberately short. */
export const EVERYDAY = new Set(
  WORDS(`
    i i'm i'll i've i'd me my we we're we'll us our you you're your he she it it's its they their
    a an the and or but so of to for at on in by with from about after before until into
    this that that's these those there here what what's when where which who how
    is am are was were be been do does did have has had will would can could should
    just still also too really very then now ok okay yeah yes yep sure oh um uh hey hi please
    well actually again already soon later little bit lot some any more most all
    tonight today tomorrow tomorrow's tonight's yesterday morning afternoon evening night noon
    week weekend monday tuesday wednesday thursday friday saturday sunday
    o'clock pm half quarter past early late time minute minutes hour hours
    one two three four five six seven eight nine ten eleven twelve fifteen thirty forty fifty
    go going gonna come coming get getting got text call remind reminder send tell ask book
    booked meet meeting start starts starting finish eat watch play try need like pick bring
    make check set move invite invited join wait see let's
    place table food reservation permission family friends mom dad
    report email emails presentation appointment movie show party trip flight class practice shift
    concert lunch breakfast coffee groceries store
    good great fun nice excited busy
  `)
);

/** Never released, wherever in the call they appear. Matched on de-leeted, lower-case text. */
export const ALWAYS_HOLD = new RegExp(
  [
    // reflexive harm and harm to anyone
    String.raw`\b(?:myself|herself|himself|themselves|yourself|ourselves|mysef|meself)\b`,
    String.raw`\b(?:die|died|dies|dying|dead|death|deadly|kill\w*|kil|murder\w*|suicid\w*|sewer ?slide|unalive|kms|kys|overdos\w*|hang|hanged|hanging|shoot\w*|stab\w*|cut|cutting|drown\w*|jump\w*|poison\w*)\b`,
    // plans, decisions, "it" as the act
    String.raw`\b(?:plan|plans|planned|planning|decided|doing it|do it|did it|through with it|end it|ending it|all of them|the whole|everything in)\b`,
    // means
    String.raw`\b(?:pills?|meds|medication|medicine|tablets?|insulin|bottle|xanax|tylenol|gun|guns|revolver|pistol|rifle|shotgun|firearm|bullets?|rope|cord|noose|knife|knives|razors?|blades?|bridge|tracks|train|roof|rooftop|ledge|cliff|overpass|top floor|garage|ocean|lake|river|charcoal|bleach|antifreeze|exhaust|car on|engine running)\b`,
    // hopelessness and life itself (never everyday logistics)
    String.raw`\b(?:hopeless\w*|worthless|pointless|give up|giving up|gave up|can'?t go on|cannot go on|waste of space|hate my life|nothing matters|no reason|tired of|life|live|living|lives)\b`,
    // hurting anyone, vanishing, wanting it to stop
    String.raw`\b(?:hurt\w*|harm\w*|vanish\w*|wasn'?t around|not around|be here|being here|it (?:all )?(?:to )?stop|make it stop)\b`,
    // finality and exits
    String.raw`\b(?:goodbye|goodbyes|bye|farewell|forever|permanently|for good|last|final|gone|anymore|without me|miss me|better off|burden|no point|disappear|wake up|alive|letters?|sorry|forgive)\b`,
  ].join('|')
);

/** Lower case, curly apostrophes straightened, common leetspeak undone. */
export function deleet(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/(?<=[a-z])[1!|](?=[a-z])/g, 'i')
    .replace(/(?<=[a-z])3(?=[a-z])/g, 'e')
    .replace(/(?<=[a-z])0(?=[a-z])/g, 'o')
    .replace(/(?<=[a-z])[@4](?=[a-z])/g, 'a')
    .replace(/(?<=[a-z])\$(?=[a-z])/g, 's');
}

export function alwaysHold(text: string): boolean {
  const plain = deleet(text).replace(/[^a-z0-9' ]+/g, ' ');
  return ALWAYS_HOLD.test(plain);
}

/**
 * Whether every word of `line` other than `anchors` is everyday. False for any
 * word with characters outside a-z, digits and an apostrophe (another script,
 * accents), and for any word mixing letters and digits.
 */
export function onlyEveryday(line: string, anchors: ReadonlySet<string>): boolean {
  const raw = String(line ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'");
  for (const token of raw.split(/[\s,.!?;:"()-]+/).filter(Boolean)) {
    if (!/^[a-z0-9']+$/.test(token)) return false;
    if (/[a-z]/.test(token) && /\d/.test(token)) return false;
    if (/^\d+$/.test(token)) continue;
    const word = token.replace(/'s$/, '');
    if (anchors.has(word) || anchors.has(token)) continue;
    if (!EVERYDAY.has(token) && !EVERYDAY.has(word)) return false;
  }
  return true;
}
