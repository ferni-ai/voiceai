/**
 * Reading a voice-eval run (scripts/voice-eval/out/*.json): who said what,
 * and Ferni's reply to each scripted caller line.
 */

export interface EvalEvent {
  t: number;
  who: 'agent' | 'user' | string;
  text: string;
}

export interface EvalRun {
  wallT0?: number;
  events: EvalEvent[];
  /** One per scripted caller line, in order. */
  results: Array<{ userEndedAt?: number }>;
}

/**
 * What the agent said between two times. Captions arrive as growing
 * prefixes ("Hey", "Hey Sam", "Hey Sam, how"), so a caption the next one
 * extends is dropped and the finished sentences are joined.
 */
export function agentLines(run: EvalRun, from: number, to: number): string {
  const said = run.events
    .filter((e) => e.who === 'agent' && e.t > from && e.t < to)
    .map((e) => e.text);
  return said
    .filter((text, i) => !(said[i + 1] ?? '').startsWith(text))
    .join(' ')
    .trim();
}

/** Ferni's reply to each scripted line: what he said after it ended and before the next one did. */
export function repliesAfter(run: EvalRun): string[] {
  const ends = run.results.map((r) => r.userEndedAt ?? NaN);
  return ends.map((end, i) => {
    if (!Number.isFinite(end)) return '';
    const next = ends.slice(i + 1).find((t) => Number.isFinite(t)) ?? Infinity;
    return agentLines(run, end, next);
  });
}
