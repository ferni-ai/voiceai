/**
 * The words before a means match that its softening check reads (crisis-means-in-hand.ts): the
 * clause and the sentence the match starts in, up to the match. #3564 r3: a turn of a thousand
 * means sentences checks a thousand matches, so the breaks are found once per turn and each match
 * finds its clause and sentence by binary search. Slicing and splitting the whole text before every
 * match was quadratic (30 ms at 20k chars, 0.75 s at 100k).
 *
 * For every start the result is exactly what the old per-match split gave:
 *   clause   = text.slice(0, start).split(/[.!?;,]|\bbut\b|\band\b|\bso\b/).pop()
 *   sentence = text.slice(0, start).split(/[.!?]/).pop()
 * crisis-means-lookback.test.ts proves it at every index of a generated corpus.
 *
 * @module CrisisMeansLookback
 */

/** What ends a clause (the sentence breaks, ";", ",", "but", "and", "so"). */
const CLAUSE_BREAK = /[.!?;,]|\bbut\b|\band\b|\bso\b/g;
/**
 * A word break that ends right at the start: cut there, the text ends after the word, so it is a
 * break even when a letter follows it in the whole text ("but" in "butter"). Four characters hold
 * the word and the character before it, for its leading \b.
 */
const WORD_BREAK_AT_END = /\b(?:but|and|so)$/;

/** The last value at or before the start, in an ascending list that begins with 0. */
function lastAtOrBefore(sorted: readonly number[], start: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid] <= start) lo = mid;
    else hi = mid - 1;
  }
  return sorted[lo];
}

/** The clause and the sentence before a start, for every start in the text; one pass, then lookups. */
export function meansLookback(
  text: string
): (start: number) => { clause: string; sentence: string } {
  const sentenceFrom = [0];
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '.' || text[at] === '!' || text[at] === '?') sentenceFrom.push(at + 1);
  }
  const clauseFrom = [0];
  for (const m of text.matchAll(CLAUSE_BREAK)) clauseFrom.push(m.index + m[0].length);
  return (start) => {
    const cut = WORD_BREAK_AT_END.test(text.slice(Math.max(0, start - 4), start));
    return {
      clause: text.slice(cut ? start : lastAtOrBefore(clauseFrom, start), start),
      sentence: text.slice(lastAtOrBefore(sentenceFrom, start), start),
    };
  };
}
