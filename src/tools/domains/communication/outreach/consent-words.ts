/**
 * The fast path of the outbound confirm gate (outreach-confirm.ts): one pass over the caller's
 * words decides only the plain cases, a bare yes ("Yeah, go ahead.") or a bare no ("No, wait.").
 * Everything else goes to the consent judge (consent-judge.ts), which never turns doubt into a yes.
 *
 * @module tools/domains/communication/outreach/consent-words
 */

// Replies made only of these count as a yes. Longest first, so "yes please" beats "yes".
const YES_PHRASES = [
  ...'go ahead|do it|send it|send them|please do|please send|thats right|sounds good'.split('|'),
  ...'yes yeah yep yup ya sure ok okay correct absolutely definitely'.split(' '),
];
// Words a yes may carry that add nothing to send: a name for whoever is speaking, a filler, or an
// echo of the question ("Should I call her?" "Yes, she should."). Never a yes on their own.
// Owner calls 10-14..10-16 placed nothing on "Go ahead, Ferni." and "Yes, she should."
// Owner call 10-17 placed nothing on "Uh, yeah, go ahead. Go ahead and give her a call." and
// "Yes, you, you need to call her.": a yes may restate the same action, never add to it.
const FILLERS = [
  ...'thank you|that works|you can|for sure|of course'.split('|'),
  ...'you need to|need to|right now'.split('|'),
  ...'and you now'.split(' '),
  ...'she should|he should|they should|you should|she can|he can|they can'.split('|'),
  ...'please thanks ferni fern maya jordan peter alex nayan buddy bud man dude pal um uh oh hey'.split(
    ' '
  ),
];
// Only when the waiting action is itself a phone call, and only in fixed phrases: with a text
// waiting, "Yes, call her." would change what is sent, and a bare "call" beside a filler ("Okay,
// he can call.", "Yes, you should call.") may hand the call to someone else. Owner call 10-26:
// "Yeah, go ahead and call." placed nothing. "Give him a call" only when "him" is the person read
// back (a call to Dad); anything else with "call", and "it's okay with me", is the judge's
// (consent-judge.ts): with a call to Dad waiting, "Yes, call her." is someone else.
const CALL_YES = ['go ahead and call', 'make the call'];
const HIM = new Set('dad father brother husband son grandpa uncle'.split(' '));
const HER = new Set('mom mum mother sister wife daughter grandma aunt'.split(' '));
const phrase = (yes: boolean) => (text: string) => ({ parts: text.split(' '), yes });
const PHRASES = [...YES_PHRASES.map(phrase(true)), ...FILLERS.map(phrase(false))];
const CALL_PHRASES = CALL_YES.map(phrase(true));
/** "Give him a call" restates a call to Dad, never one to Doug (unknown) or to Mom. */
function restatements(target: readonly string[]): Array<ReturnType<ReturnType<typeof phrase>>> {
  const him = target.some((w) => HIM.has(w));
  const her = target.some((w) => HER.has(w));
  if (him === her) return [];
  return [phrase(false)(`give ${him ? 'him' : 'her'} a call`)];
}
export const NOES = 'no nope nah not dont never wait stop cancel'.split(' ');
// Never taken for a name the caller calls Ferni by: a word that could change what is sent
// (who, when, how, how many), a question word or a no. "Yes, Tuesday." is not a plain yes.
const NOT_A_NAME = new Set([
  ...NOES,
  ...`call ring dial phone text email message send tell ask voicemail facetime who what when where
    why how which instead also too again both all everyone first later now noon today tonight
    tomorrow morning afternoon evening monday tuesday wednesday thursday friday saturday sunday
    mom mum mother dad father sister brother wife husband son daughter grandma grandpa aunt
    uncle cousin friend boss doctor her him them me us it that this there here`.split(/\s+/),
]);

// Names that may address Ferni inside a yes: the personas (as in FILLERS) and STT mishearings of
// "Ferni" (agents/personas/name-mishear.ts, plus "fred" and "freddie", taken as the name only
// here: in other speech "Fred" is as likely a real person). Owner call 10-18: "Uh, go ahead, Fred."
const FERNI_NAMES = new Set([
  ...'ferni fern maya jordan peter alex nayan'.split(' '),
  ...'freddy freddie fred fernie ferny furny'.split(' '),
]);

export const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .match(/[a-z]+/g) ?? [];

/**
 * A reply made only of yes phrases (and please/thanks); never with a "?" or "Sure, to Bob".
 * It may also carry one name set off by a comma at its start or end ("Uh, go ahead, Fred."),
 * but only a name that leaves the action as read back: Ferni's (or a persona's) name or a
 * mishearing of it, the owner's own first name (`owner`), or the person the action reaches
 * (`target`: "Yes, go ahead, Mike." for a call to Mike restates it). Any other name voids the
 * yes: with a call to Mike waiting, "Yes, go ahead, Bob." may mean Bob. Never a NOT_A_NAME word.
 */
export function isClearYes(
  text: string,
  target: readonly string[] = [],
  owner: readonly string[] = [],
  call = false
): boolean {
  // A question word is never a yes phrase, so "which one, yes" already fails below.
  if (text.includes('?')) return false;
  const said = words(text);
  // "Call you / me / us" hands the action back, whatever surrounds it.
  if (said.some((w, i) => w === 'call' && ['you', 'me', 'us'].includes(said[i + 1]))) return false;
  if (onlyYes(said, call ? [...CALL_PHRASES, ...restatements(target)] : [])) return true;
  const parts = text.split(',');
  if (parts.length < 2) return false;
  const head = parts[0].trim().split(/\s+/);
  const tail = parts[parts.length - 1].trim().replace(/[.!…]+$/, '');
  const options: Array<[string, string]> = [
    [head[head.length - 1], [...head.slice(0, -1), ...parts.slice(1)].join(' ')],
  ];
  if (!/\s/.test(tail)) options.push([tail, parts.slice(0, -1).join(' ')]);
  const isName = (w: string): boolean => {
    const name = w.toLowerCase();
    if (!/^[A-Z][a-z]+$/.test(w) || NOT_A_NAME.has(name)) return false;
    return FERNI_NAMES.has(name) || target.includes(name) || owner.includes(name);
  };
  // No "call" beside a name, even one set off by a comma: STT's commas aren't the caller's
  // ("Yeah, call, Peter." may be "Yeah, call Peter.").
  return options.some(([name, rest]) => isName(name) && onlyYes(words(rest), []));
}

/**
 * Whether the words split wholly into yes phrases and fillers, with at least one yes. Every phrase
 * that fits at a point is tried, not just the first in the lists: "you" (a filler) used to win over
 * "you should", leaving "should" alone, so "Yes, you should." placed nothing (owner call 10-26).
 * One pass over word positions (reached without a yes / with one), so no reply takes more than
 * words × phrases steps however many ways it splits.
 */
function onlyYes(said: string[], callPhrases: typeof PHRASES): boolean {
  const phrases = [...PHRASES, ...callPhrases];
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

/** Whether any word of it is a no ("not", "don't", "wait"): never a plain yes, maybe not a no. */
export function isClearNo(text: string): boolean {
  return words(text).some((x) => NOES.includes(x));
}

// A reply that opens with one of these is a no to the read-back ("No, wait.", "Hold on, who?").
const NO_OPENERS = [
  ...'no nope nah dont cancel wait stop'.split(' '),
  ...'hold on|not now|not yet|never mind|no thanks'.split('|'),
].map((p) => p.split(' '));
const OPENER_FILLERS = new Set('um uh oh well actually hey ferni'.split(' '));

/** Whether the reply opens with a no ("Um, no, call my mom.", "Wait.", "Never mind."). */
export function isPlainNo(text: string): boolean {
  const said = words(text);
  const at = said.findIndex((w) => !OPENER_FILLERS.has(w));
  return at >= 0 && NO_OPENERS.some((p) => p.every((part, j) => said[at + j] === part));
}
