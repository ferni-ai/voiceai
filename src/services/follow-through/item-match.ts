/**
 * Whether something the person said is about one of their todos: the content
 * words two texts share, crudely stemmed ("calling Mom's" → call, mom), with
 * answer and time words left out so "yeah, done tomorrow" names nothing.
 *
 * Two strengths, one place, so every reader agrees on what counts as naming an
 * item: mentionsItem (one shared stem) is enough for "did they answer what Ferni
 * asked?"; namesItem (whole words, all or two of the item's naming words) gates
 * any write to the todo's own store.
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

/** Verbs a todo starts with ("book the dentist"): they say what to do, not which item it is. */
const ACTION = new Set(
  `book fix call ring send buy pay get do make schedule email text pick up order renew return cancel
  check ask tell write sign submit file clean take bring set reply follow finish start look find`.split(
    /\s+/
  )
);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z']*/g) ?? []).map((w) => w.replace(/'s$/, ''));
}

/** The item's naming words: stopwords anywhere and its leading action verbs dropped. */
function namingWords(itemText: string): string[] {
  const words = tokens(itemText).filter((w) => w.length >= 3 && !STOP.has(w));
  while (words.length > 0 && ACTION.has(words[0])) words.shift();
  return [...new Set(words)];
}

/**
 * The whole words that count as `word`: itself and its plural, and for words of
 * five letters or more the -ed/-ing forms ("water" ~ "watered"). Never a prefix:
 * "car" is not "caring" or "cart".
 */
function formsOf(word: string): Set<string> {
  const base = word.length > 4 && /[^s]s$/.test(word) ? word.slice(0, -1) : word;
  const forms = new Set([word, base, `${base}s`, `${base}es`]);
  if (base.length >= 5) {
    const stem = base.endsWith('e') ? base.slice(0, -1) : base;
    for (const end of ['ed', 'ing']) forms.add(stem + end);
  }
  return forms;
}

/**
 * Names the item firmly enough to change its store: every naming word when it
 * has one or two ("booked the dentist" names "Book the dentist"; "booked the
 * flight" does not), at least two when it has more. Whole words only, so one
 * shared verb or a word inside a word never closes the wrong item, and a bare
 * "yep, done" names nothing. When in doubt this says no: a missed close costs a
 * stale mention, a wrong one cancels someone's real reminder.
 */
export function namesItem(text: string, itemText: string): boolean {
  const said = new Set(tokens(text));
  const naming = namingWords(itemText);
  const hits = naming.filter((w) => [...formsOf(w)].some((f) => said.has(f))).length;
  return naming.length > 0 && hits >= Math.min(naming.length, 2);
}
