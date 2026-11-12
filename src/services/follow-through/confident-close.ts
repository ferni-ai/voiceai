/**
 * Whether an answer is sure enough to close a todo where it lives, not only
 * Ferni's follow-up about it.
 *
 * Asked "did you book the dentist?", any done closes the follow-up. The todo's
 * own store (reminder, task, commitment) is written only when the answer is one
 * short, plain statement that names the whole todo: "Booked the dentist, done."
 * A wrong write cancels someone's real reminder; a missed one costs a mention
 * the next brief drops anyway. So every rule here says no when unsure.
 *
 * @module services/follow-through/confident-close
 */

import { closeFromReply } from './close-from-reply.js';
import { STOP, tokens } from './item-match.js';

/** Longer answers wander ("…the dentist is the thing I keep putting off…"). */
const MAX_WORDS = 12;

/** A second clause can carry the "done" while the todo sits in the other one. */
const CONTRAST = /\b(but|though|although|except|however|yet|still|instead|whereas)\b|[;?]/;

/** Not done, not yet, or not sure: no store is closed on any of these. */
const NOT_DONE =
  /n't\b|'ll\b|\b(not|no|nope|never|nothing|none|cannot|later|soon|tonight|tomorrow|next (week|month)|fell through|on my list|pending|waiting|till|until|will|gonna|going to|need to|have to|almost|maybe)\b/;

/** Words that only answer ("yep", "done", "let it go"): a clause of these alone names nothing. */
const ANSWER_ONLY = new Set(
  `yep yes yeah yup ya ok okay sure all set done finished sorted handled complete completed it
  it's that that's is was totally fully let go drop forget skip thanks`.split(/\s+/)
);

/** Verbs a todo starts with ("book the dentist"). Only these are matched in their other forms. */
const ACTION = new Set(
  `book fix call ring send buy pay get go do make schedule email text pick order renew return
  cancel check ask tell write sign submit file clean take bring set reply follow finish start look
  find walk water feed mail wash pack move visit print cook confirm register`.split(/\s+/)
);

/** Past forms no suffix rule makes ("paid the rent" is "pay the rent"). */
const IRREGULAR: Readonly<Record<string, string>> = {
  pay: 'paid',
  send: 'sent',
  buy: 'bought',
  go: 'went',
  make: 'made',
  get: 'got',
  take: 'took',
  do: 'did',
};

/** The todo's verb in whole-word forms: book, books, booked, booking (and shop → shopped, make → making). */
function verbForms(verb: string): Set<string> {
  const stem = verb.endsWith('e') ? verb.slice(0, -1) : verb;
  const forms = [verb, `${verb}s`, `${verb}es`, `${stem}ed`, `${stem}ing`];
  if (/[bdgklmnprt]$/.test(verb)) forms.push(`${verb}${verb.slice(-1)}ed`, `${verb}${verb.slice(-1)}ing`); // prettier-ignore
  const irregular = IRREGULAR[verb];
  if (irregular) forms.push(irregular);
  return new Set(forms);
}

/**
 * Any other naming word, exact or plural only: "fern" ~ "ferns", never
 * "car" ~ "caring" or "rent" ~ "rented". Only the item's word is singularised,
 * never the answer's.
 */
function nounForms(word: string): Set<string> {
  let one = word;
  if (/(s|x|z|ch|sh)es$/.test(word)) one = word.slice(0, -2);
  else if (word.length > 3 && /[^s]s$/.test(word)) one = word.slice(0, -1);
  return new Set([word, one, `${one}s`, `${one}es`]);
}

/**
 * What the answer must say, in the item's order: its leading verb (never
 * dropped: "paid the library fine" doesn't return the library books) and every
 * other word that isn't filler. An item with nothing but a verb ("do it") can't
 * be named firmly, so it has none.
 */
function namingForms(itemText: string): Array<Set<string>> | null {
  const words = tokens(itemText);
  const verb = words.length > 0 && ACTION.has(words[0]) ? words[0] : null;
  const rest = (verb ? words.slice(1) : words).filter((w) => w.length >= 3 && !STOP.has(w));
  const nouns = [...new Set(rest)];
  if (nouns.length === 0) return null;
  return [...(verb ? [verbForms(verb)] : []), ...nouns.map(nounForms)];
}

/** Every naming word, in the item's order ("bill … mom" doesn't name "call Mom about the bill"). */
function namesInOrder(said: string[], naming: Array<Set<string>>): boolean {
  let at = -1;
  for (const forms of naming) {
    at = said.findIndex((w, i) => i > at && forms.has(w));
    if (at < 0) return false;
  }
  return true;
}

/** Pieces with something to say beyond "yep" or "done": more than one is more than one clause. */
function contentClauses(said: string): number {
  return said.split(/[,.!:…–—]+/).filter((part) => tokens(part).some((w) => !ANSWER_ONLY.has(w)))
    .length;
}

/**
 * Close the todo's own store only when ALL hold: one clause; no negation,
 * deferral or question; at most MAX_WORDS words; every naming word of the item
 * present as a whole word, in order; and the sentence that names it also says
 * done (or let go) by itself. Anything less closes the follow-up only.
 */
export function confidentClose(answer: string, itemText: string): boolean {
  const said = answer.toLowerCase().replace(/[‘’]/g, "'");
  const verdict = closeFromReply(said);
  if (verdict !== 'done' && verdict !== 'release') return false;
  if (CONTRAST.test(said) || NOT_DONE.test(said) || contentClauses(said) > 1) return false;
  if ((said.match(/[\p{L}\p{N}']+/gu) ?? []).length > MAX_WORDS) return false;
  const naming = namingForms(itemText);
  if (!naming) return false;
  return said
    .split(/[.!…]+/)
    .some(
      (sentence) => closeFromReply(sentence) === verdict && namesInOrder(tokens(sentence), naming)
    );
}
