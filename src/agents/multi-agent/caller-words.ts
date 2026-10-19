/**
 * The caller's words as a set of topics, and whether a line says only what they said.
 * Shared by the handoff brief (handoff-brief.ts) and the arrival-line check
 * (arrival-grounding.ts).
 *
 * @module agents/multi-agent/caller-words
 */

import { contentWords } from '../../memory/recall/session-recall.js';
import { teammateHeardAs } from '../../tools/handoff/teammate-names.js';

/** Words that ask for a teammate, or are filler, rather than say what the call is about. */
const ASKING = new Set(
  "talk talking speak speaking chat chatting switch transfer hand bring put connect over hey please want wanted need wanna gonna let let's help hello thank thanks sure yes yep okay right now quick minute someone somebody doing well good great hope question thing stuff side whether more glad calling called asked ask getting get into what's you're you've i've it's that's we're said told heard hear mentioned filled voice day today tonight evening morning afternoon week weekend time moment ready dig figure start sounds sorted fun cool nice awesome perfect exciting together mind world energy happening".split(
    ' '
  )
);

/** What a line is about once the teammates' names and the asking are taken out. */
export function topicWords(text: string): string[] {
  return [...contentWords(text)].filter((w) => !ASKING.has(w) && teammateHeardAs(w) === null);
}

/** The same word give or take an ending: "plan"/"planning", "move"/"moving". */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const base = (w: string): string => w.replace(/(?:ing|ed|er|es|s)$/, '').replace(/e$/, '');
  const [x, y] = [base(a), base(b)];
  return (
    x.length >= 3 && (x === y || x === y.replace(/(.)\1$/, '$1') || y === x.replace(/(.)\1$/, '$1'))
  );
}

/**
 * True when `text` is the caller's own words or a close paraphrase: every word it is
 * about is one they said (give or take an ending). One added detail ("Paris", "the
 * divorce") is enough to refuse it.
 */
export function groundedIn(text: string, callerLines: string[]): boolean {
  const said = topicWords(callerLines.join(' '));
  const words = topicWords(text);
  return words.length > 0 && words.every((w) => said.some((s) => sameWord(w, s)));
}
