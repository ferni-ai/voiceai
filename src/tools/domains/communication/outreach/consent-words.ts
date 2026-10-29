/**
 * The allow-list (outreach-confirm.ts, consent-window.ts): a call or text goes out on an answer
 * only when ALL of it, normalised, is agreement plus optional filler: the person read back, "now",
 * "please", "thanks", Ferni's name. Any other word asks once instead. Block lists never converged
 * (#2962 rounds 1-3: sarcasm, idioms, "have his wife call him", "ring him at the house").
 * @module tools/domains/communication/outreach/consent-words
 */

// Agreement. Owner calls 10-24..10-26: "Yeah, go ahead.", "Sure.", "Yes, you should."
const YES =
  'go ahead|go for it|please do|do it|thats right|of course|sounds good|you should|you can|uh huh|mm hmm|mm hm|its okay with me|its ok with me|thats okay with me|thats fine with me|yes|yeah|yep|yup|ya|sure|ok|okay|alright|correct|absolutely|definitely|mhm|mhmm'.split(
    '|'
  );
// Ferni's name and its STT mishearings (agents/personas/name-mishear.ts). Owner call 10-18: "Uh, go ahead, Fred."
export const FERNI = 'ferni fernie ferny furny fred freddy freddie'.split(' ');
// Never a yes alone: politeness, filler, Ferni's name.
const FILLERS = [
  ...'thank you|right now'.split('|'),
  ...'please thanks now and um uh oh so well hey'.split(' '),
  ...FERNI,
];
const HIM = new Set('dad father brother husband son grandpa uncle'.split(' '));
const HER = new Set('mom mum mother sister wife daughter grandma aunt'.split(' '));
export const KIN = new Set([...HIM, ...HER]);
/** Not now: the owner deferring, or Ferni offering another time. */
export const LATER =
  'later tomorrow tonight instead monday tuesday wednesday thursday friday saturday sunday'.split(
    ' '
  );
/** Anyone but the person read back, when named this way ("call my sister", "your boss"). */
export const OTHERS = new Set([...KIN, ...'cousin friend boss doctor neighbor'.split(' ')]);
const STOP = new Set('my the a your his her their'.split(' '));
/** "him" for a call to Dad, "her" for Mom; undefined for a name ("Doug") or both. */
export function pronounOf(target: readonly string[]): 'him' | 'her' | undefined {
  const him = target.some((w) => HIM.has(w));
  const her = target.some((w) => HER.has(w));
  return him === her ? undefined : him ? 'him' : 'her';
}
interface Phrase {
  parts: string[];
  yes: boolean;
}
const phrase = (text: string, yes: boolean): Phrase => ({ parts: text.split(' '), yes });

/** The phrases allowed for this action: who it reaches decides which "call X" restates it. */
function allowed(target: readonly string[], owner: readonly string[], call: boolean): Phrase[] {
  const people = target.filter((w) => !STOP.has(w));
  const pronoun = pronounOf(target);
  const objects = [
    ...(pronoun ? [pronoun] : ['him', 'her', 'them']),
    ...people.flatMap((w) => [w, `my ${w}`]),
  ];
  const out = [
    ...YES.map((t) => phrase(t, true)),
    ...[...FILLERS, ...owner, ...people].map((t) => phrase(t, false)),
  ];
  if (!call)
    return [...out, ...'send it|send them|please send'.split('|').map((t) => phrase(t, true))];
  return [
    ...out,
    phrase('go ahead and call', true),
    phrase('make the call', true),
    ...objects.flatMap((o) => [phrase(`call ${o}`, true), phrase(`give ${o} a call`, true)]),
    phrase('check in', false),
  ];
}

/**
 * Whether the reply is a plain yes: wholly allow-listed phrases, at least one of them agreement,
 * no "?". Digits are kept, so "go ahead and call 555-0199" is not plain.
 */
export function isClearYes(
  text: string,
  target: readonly string[] = [],
  owner: readonly string[] = [],
  call = false
): boolean {
  if (text.includes('?')) return false;
  const said =
    text
      .toLowerCase()
      .replace(/['’]/g, '')
      .match(/[a-z0-9]+/g) ?? [];
  // No name but the person read back after a "call", fillers or not: "go ahead and call, um, Fred".
  const named = new Set([...FERNI, ...owner]);
  if (said.some((w, i) => named.has(w) && said.slice(0, i).includes('call'))) return false;
  return onlyYes(said, allowed(target, owner, call));
}

/**
 * Whether the words split wholly into the phrases, with at least one yes. Every phrase that fits
 * at a point is tried. One pass over word positions (reached without a yes / with one), so no
 * reply takes more than words × phrases steps however many ways it splits.
 */
function onlyYes(said: string[], phrases: Phrase[]): boolean {
  const plain = said.map((_, i) => i === 0);
  const withYes = said.map(() => false);
  const done = [false, false];
  const reach = (at: number, yes: boolean): void => {
    if (at === said.length) done[yes ? 1 : 0] = true;
    else if (yes) withYes[at] = true;
    else plain[at] = true;
  };
  for (let i = 0; i < said.length; i++) {
    if (!plain[i] && !withYes[i]) continue;
    for (const { parts, yes } of phrases) {
      if (!parts.every((part, j) => said[i + j] === part)) continue;
      if (plain[i]) reach(i + parts.length, yes);
      if (withYes[i]) reach(i + parts.length, true);
    }
  }
  return done[1];
}

export const NOES = 'no nope nah not dont never wait stop cancel'.split(' ');
export const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .match(/[a-z]+/g) ?? [];

/** Whether any word of it is a no ("not", "don't", "wait"): never a plain yes, maybe not a no. */
export function isClearNo(text: string): boolean {
  return words(text).some((x) => NOES.includes(x));
}

// A reply that opens with one of these is a no to the read-back ("No, wait.", "Hold on, who?").
const NO_OPENERS = [
  ...'no nope nah dont cancel wait stop'.split(' '),
  ...'hold on|hang on|one sec|one second|not now|not yet|never mind|no thanks'.split('|'),
].map((p) => p.split(' '));
const OPENER_FILLERS = new Set('um uh oh well actually hey ferni'.split(' '));

/** Whether the reply opens with a no ("Um, no, call my mom.", "Wait.", "Never mind."). */
export function isPlainNo(text: string): boolean {
  const said = words(text);
  const at = said.findIndex((w) => !OPENER_FILLERS.has(w));
  return at >= 0 && NO_OPENERS.some((p) => p.every((part, j) => said[at + j] === part));
}
