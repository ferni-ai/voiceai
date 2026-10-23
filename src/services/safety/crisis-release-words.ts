/**
 * The words a grounded release may stand on (crisis-grounded-release.ts).
 *
 * Round 1 used a deny list; the lead's adversarial verify released 27 of 71
 * new risky lines through it with both reads fooled. Round 2 used an
 * allowlist but exempted any word the caller had said earlier, and the risk
 * rode in on those words ("Tonight it's me, the truck and the hose.", "I'll
 * see grandpa tonight."): 39 of 88 released. So now nothing is exempt. A line
 * can be released only when EVERY word is in EVERYDAY (function words, times,
 * small number words, logistics verbs) or EVENTS (everyday events: dinner, the
 * game, a meeting), and an event word in it is one the caller already named
 * (eventTopics). No digits, no person words, no "it", "finish", "see" or
 * "time": each of those let a finality line through on everyday words alone.
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
    i i'm i'll i've i'd me my we we're we'll us our you you're your
    a an the and or but so of to for at on in by with from about after before until
    this that these those there here what when where which who how
    is am are was were do does did have has had will would can could should
    just still also too really very then ok okay yeah yes yep sure oh um uh hey hi please
    well actually again already soon later little bit
    tonight today tomorrow tomorrow's tonight's yesterday morning afternoon evening noon
    weekend monday tuesday wednesday thursday friday saturday sunday
    o'clock pm half quarter early late
    two three four five six seven eight nine ten eleven twelve
    go going gonna come coming get getting text call remind reminder send ask book booked
    meet start starts starting eat watch play try need like pick bring check invite invited
    join wait let's
    place table food reservation permission
    good great fun nice excited busy
  `)
);

/** Everyday events a released line may be about. The caller must have named it already. */
export const EVENTS = new Set(
  WORDS(`
    dinner lunch breakfast brunch game match party movie show concert meeting appointment
    reservation trip flight class practice shift work school birthday recital rehearsal
    interview presentation report coffee drinks barbecue picnic groceries
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
    String.raw`\b(?:pills?|meds|medication|medicine|tablets?|insulin|bottle|xanax|tylenol|gun|guns|revolver|pistol|rifle|shotgun|firearm|bullets?|rope|cord|noose|knife|knives|razors?|blades?|bridge|tracks|train|roof|rooftop|ledge|cliff|overpass|top floor|garage|ocean|lake|river|charcoal|bleach|antifreeze|exhaust|car on|engine running|ambien|oxy\w*|glock\w*|gauge)\b`,
    // the r3 earlier-line misses: a note, ending things, leaving, giving things away
    String.raw`\b(?:the note|end things|ending things|never wake|ctb|dip out|dipping out|check(?:ing|ed)? out|(?:sold|sell|selling|gave|give|giving) away my|ir de este mundo)\b`,
    // hopelessness and life itself (never everyday logistics)
    String.raw`\b(?:hopeless\w*|worthless|pointless|give up|giving up|gave up|can'?t go on|cannot go on|waste of space|hate my life|nothing matters|no reason|tired of|life|live|living|lives)\b`,
    // hurting anyone, vanishing, wanting it to stop
    String.raw`\b(?:hurt\w*|harm\w*|vanish\w*|wasn'?t around|not around|be here|being here|it (?:all )?(?:to )?stop|make it stop)\b`,
    // stockpiling, and veiled "the moment has come" phrases (round 2 probe)
    String.raw`\b(?:pharmacy|prescriptions?|refills?|doses?|capsules?|stockpil\w*|the night|the day|the end|it'?s time|time to|other side|for later)\b`,
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

/** The line's words, lower case, or null when one is not plain English letters. */
export function wordsOf(line: string): string[] | null {
  const raw = String(line ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'");
  const out: string[] = [];
  for (const token of raw.split(/[\s,.!?;:"()-]+/).filter(Boolean)) {
    if (!/^[a-z']+$/.test(token)) return null;
    out.push(token);
  }
  return out;
}

/** Every word is everyday or an everyday event, plain letters only (no digits, no accents). */
export function allEveryday(line: string): boolean {
  const words = wordsOf(line);
  return (
    !!words &&
    words.length > 0 &&
    words.every((w) => EVERYDAY.has(w) || EVENTS.has(w) || EVENTS.has(w.replace(/'s$/, '')))
  );
}

/** The everyday events in `line` that the caller already named in an earlier line. */
export function eventTopics(line: string, earlier: readonly string[]): Set<string> {
  const said = new Set(earlier.flatMap((l) => (wordsOf(l) ?? []).map((w) => w.replace(/'s$/, ''))));
  const topics = (wordsOf(line) ?? [])
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => EVENTS.has(w) && said.has(w));
  return new Set(topics);
}
