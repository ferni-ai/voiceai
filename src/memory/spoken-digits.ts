/**
 * Numbers said as words, as digits (#2425 review): "four one one one ..." is a card number,
 * "oh seven eight oh five ..." a Social Security number. The credential checks read a
 * shadow copy with each run of two or more number words written as digits, and every
 * place in the shadow maps back to the words it came from, so a redaction covers them.
 *
 * @module memory/spoken-digits
 */

const ONES: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};
const TEENS =
  'ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');

/** "forty eight" is "48", "forty" alone "40", "twelve" "12"; null when it isn't a number word. */
function digitsOf(w: string, next: string): { digits: string; words: number } | null {
  const ten = TENS.indexOf(w);
  if (ten >= 0) {
    const one = ONES[next];
    return one !== undefined && one !== '0' && next !== 'oh'
      ? { digits: `${ten + 2}${one}`, words: 2 }
      : { digits: `${ten + 2}0`, words: 1 };
  }
  const teen = TEENS.indexOf(w);
  if (teen >= 0) return { digits: `${teen + 10}`, words: 1 };
  const one = ONES[w];
  return one === undefined ? null : { digits: one, words: 1 };
}

export interface SpokenDigits {
  /** The text with each run of number words as digits. */
  text: string;
  /** A span of `text` as a span of the original. */
  original: (start: number, end: number) => { start: number; end: number };
}

interface Run {
  start: number;
  end: number;
  digits: string;
}

/** The run of number words starting at found[i], and the index after it. */
function runAt(
  input: string,
  found: RegExpMatchArray[],
  i: number
): { run: Run | null; next: number } {
  let digits = '';
  let j = i;
  while (j < found.length) {
    const m = found[j];
    const prev = found[j - 1];
    if (m === undefined) break;
    // A run continues across spaces and hyphens only ("forty-eight", "four one one one")
    const gap = prev === undefined ? '' : input.slice((prev.index ?? 0) + prev[0].length, m.index);
    if (j > i && !/^[\s-]+$/.test(gap)) break;
    const d = digitsOf(m[0].toLowerCase(), found[j + 1]?.[0].toLowerCase() ?? '');
    if (d === null) break;
    digits += d.digits;
    j += d.words;
  }
  const first = found[i];
  const last = found[j - 1];
  const run =
    j - i >= 2 && first !== undefined && last !== undefined
      ? { start: first.index ?? 0, end: (last.index ?? 0) + last[0].length, digits }
      : null;
  return { run, next: Math.max(j, i + 1) };
}

/** The text with runs of two or more number words ("four eight two one") as digits ("4821"). */
export function spokenDigits(input: string): SpokenDigits {
  const found = [...input.matchAll(/[A-Za-z]+/g)];
  const runs: Run[] = [];
  for (let i = 0; i < found.length;) {
    const { run, next } = runAt(input, found, i);
    if (run !== null) runs.push(run);
    i = next;
  }
  let text = '';
  let at = 0;
  const pieces: Array<{ start: number; end: number; from: number; to: number }> = [];
  for (const r of runs) {
    text += input.slice(at, r.start);
    pieces.push({
      start: text.length,
      end: text.length + r.digits.length,
      from: r.start,
      to: r.end,
    });
    text += r.digits;
    at = r.end;
  }
  text += input.slice(at);
  const toOriginal = (p: number, isEnd: boolean): number => {
    let shift = 0;
    for (const piece of pieces) {
      if (p < piece.start || (isEnd && p === piece.start)) break;
      if (p < piece.end || (isEnd && p === piece.end)) return isEnd ? piece.to : piece.from;
      shift = piece.to - piece.end;
    }
    return p + shift;
  };
  return {
    text,
    original: (start, end) => ({ start: toOriginal(start, false), end: toOriginal(end, true) }),
  };
}
