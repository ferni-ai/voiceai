/**
 * Whether something the person said is about one of their todos: the content
 * words two texts share, crudely stemmed ("calling Mom's" → call, mom), with
 * answer and time words left out so "yeah, done tomorrow" names nothing.
 *
 * One matcher for every reader, so the call opener ("did they answer what Ferni
 * asked?") and the after-call close ("which todo did they talk about?") agree
 * on what counts as naming an item.
 *
 * @module services/follow-through/item-match
 */

const STOP = new Set(
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

function shared(text: string, itemText: string): { count: number; ofItem: number } {
  const theirs = contentWords(itemText);
  return {
    count: [...contentWords(text)].filter((w) => theirs.has(w)).length,
    ofItem: theirs.size,
  };
}

/** Shares a content word with the item ("did you ring your mom?" ~ "call mom"). */
export function mentionsItem(text: string, itemText: string): boolean {
  return shared(text, itemText).count > 0;
}

/**
 * Names the item firmly enough to change it: at least half its content words
 * ("forget the dentist" names "book the dentist"). A store write needs more than
 * one loose word in common with a longer item ("the party" is not "buy balloons
 * for the party").
 */
export function namesItem(text: string, itemText: string): boolean {
  const { count, ofItem } = shared(text, itemText);
  return count > 0 && count >= Math.ceil(ofItem / 2);
}
