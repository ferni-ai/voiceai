/**
 * Text folding and a light stemmer for matching forget requests to memories
 * (session-recall.ts forgetTokens / isForgotten, shared by every recall
 * reader: facts, open threads, episode quotes, call summaries).
 *
 * The tokenizer kept a-z0-9 only and dropped a plural "s", so a forgotten
 * topic could still come back in another form: "Zoë" read as "zo" and never
 * matched "Zoe", a decomposed "José" missed a composed one, "divorce" missed
 * "divorcing", "babies" missed "baby", and "ex-wife" missed "exwife". Both
 * sides are now folded the same way: compatibility-decomposed with accents
 * removed, curly apostrophes made straight, a hyphen inside a word joined
 * ("ex-wife" = "exwife"), and each word stemmed. Synonyms and nicknames
 * ("Bob" for "Robert") are out of scope.
 *
 * @module memory/recall/forget-tokens
 */

/** Accents removed (NFKD), straight apostrophes, hyphens inside words joined; case kept. */
export function foldCase(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/([A-Za-z])[-\u2010\u2011\u2013](?=[A-Za-z])/g, '$1');
}

/** foldCase, lower case. */
export function foldText(text: string): string {
  return foldCase(text).toLowerCase();
}

/**
 * The words of `text` as the forget matcher reads them: folded, "'s"
 * dropped, numbers written with spaces or dashes joined. `plain` marks a
 * word the stemmer must leave alone: a capitalized word (a name: "James"
 * is not "jam") or one of four letters or fewer ("news" is not "new").
 */
export function foldedWords(text: string): Array<{ word: string; plain: boolean }> {
  const joined = foldCase(text).replace(/(\d)[\s().-]+(?=\d)/g, '$1');
  // Any script: Unicode letters and digits, lower-cased by locale-free toLowerCase.
  const words = joined.match(/[\p{L}\p{N}][\p{L}\p{N}']*/gu) ?? [];
  return words.map((w) => {
    const word = w.toLowerCase().replace(/'s$/, '').replace(/'/g, '');
    return { word, plain: /^[A-Z]/.test(w) || word.length <= 4 };
  });
}

/**
 * The tokenizer before 2026-10-11, kept because topics stored by it are
 * still read: "Zoë" was stored as "zo" and "babies" as "babie". A stored
 * topic's words are compared as stored against a memory read this way.
 */
export function legacyForgetTokens(text: string, skip: ReadonlySet<string>): string[] {
  const joined = text.toLowerCase().replace(/(\d)[\s().-]+(?=\d)/g, '$1');
  const words = joined.match(/[a-z0-9][a-z0-9']*/g) ?? [];
  const out = words
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => w.length >= 2 && !skip.has(w))
    .map((w) => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w));
  return [...new Set(out)];
}

const UNDOUBLE = /([b-df-hj-kmnp-rtv-y])\1$/;

function stemOnce(w: string): string {
  if (w.length <= 4 || /\d/.test(w)) return w;
  // babies, studied, cookie: one stem ("baby", "study", "cooky") for -ies, -ied, -ie.
  if (/(?:ies|ied)$/.test(w)) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ie')) return `${w.slice(0, -2)}y`;
  if (/[^sui]s$/.test(w)) return w.slice(0, -1);
  for (const suffix of ['ing', 'ed']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      const base = w.slice(0, -suffix.length);
      return UNDOUBLE.test(base) ? base.slice(0, -1) : base;
    }
  }
  if (w.endsWith('e')) return w.slice(0, -1);
  return w;
}

/**
 * A light suffix stripper ("babies" = "baby", "studied" = "studies",
 * "divorcing" = "divorce" = "divorc"), run until nothing changes, so a stem
 * stems to itself. Words of four letters or fewer are left alone.
 */
export function stem(word: string): string {
  let w = word;
  for (;;) {
    const next = stemOnce(w);
    if (next === w) return w;
    w = next;
  }
}
