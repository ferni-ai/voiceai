/**
 * Whether something the person said is about one of their todos: the content
 * words two texts share, crudely stemmed ("calling Mom's" → call, mom), with
 * answer and time words left out so "yeah, done tomorrow" names nothing.
 *
 * One place, so every reader agrees on what counts as being about an item:
 * mentionsItem (one shared stem) is enough for "did they answer what Ferni
 * asked?". Writing to the todo's own store needs far more: see confident-close.
 *
 * @module services/follow-through/item-match
 */

/** Answer, time and filler words: they never say which todo someone means. */
export const STOP = new Set(
  `the and you your yours she her him his they them their its it's that this those these was were
  are have has had haven't hasn't didn't did done not yet yes yeah yep yup nope okay just really
  actually already finally still maybe about with from for but got get getting went go going
  today tonight tomorrow yesterday last night morning afternoon evening week weekend later soon
  monday tuesday wednesday thursday friday saturday sunday forget never mind drop skip remind
  finished handled sorted took care called call calling ugh hmm umm well honestly man gosh wow
  nah sure alright thanks thank sorry good great fine totally definitely probably`.split(/\s+/)
);

/** Content words, crudely stemmed. Answer and time words don't count. */
export function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z']+/g) ?? []) {
    const w = raw.replace(/'s$/, '');
    const stem = w.length > 4 ? w.replace(/(ing|ed|s)$/, '') : w;
    if (w.length >= 3 && !STOP.has(w) && !STOP.has(stem)) out.add(stem);
  }
  return out;
}

/** Shares a content word with the item ("did you ring your mom?" ~ "call mom"). */
export function mentionsItem(text: string, itemText: string): boolean {
  const theirs = contentWords(itemText);
  return [...contentWords(text)].some((w) => theirs.has(w));
}

/** Whole lower-case words, a possessive dropped ("Mom's" → mom). */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z']*/g) ?? []).map((w) => w.replace(/'s$/, ''));
}
