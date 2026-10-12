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

/** Lower case, accents removed (NFKD), straight apostrophes, hyphens inside words joined. */
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/([a-z])[-\u2010\u2011\u2013](?=[a-z])/g, '$1');
}

const UNDOUBLE = /([b-df-hj-kmnp-rtv-y])\1$/;

function stemOnce(w: string): string {
  if (w.length < 4 || /\d/.test(w)) return w;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
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
 * A light suffix stripper ("babies" = "baby", "divorcing" = "divorce" =
 * "divorc"), run until nothing changes, so a stem stems to itself and a
 * stored topic (kept as stems) matches the same way when read back.
 */
export function stem(word: string): string {
  let w = word;
  for (;;) {
    const next = stemOnce(w);
    if (next === w) return w;
    w = next;
  }
}
