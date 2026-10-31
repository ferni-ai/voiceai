/**
 * The markdown report of one full-path simulator run (full-path-sim.ts). Names
 * corpus turns by id and, for the repo's fictional corpora, by their words.
 */

import { pct, type FiredPath, type SimSummary } from './full-path-summary.js';
import type { GenerateTally } from './retried-generate.js';

export interface RunCost {
  minutes: number;
  tally: GenerateTally;
  /**
   * Estimated tokens (4 characters each) and dollars at the given prices per million.
   * Default: gemini-3.5-flash-lite list price as aggregators quoted it 2026-10-31 ($0.30 in,
   * $2.50 out); set CRISIS_SIM_USD_PER_MTOK_IN / _OUT for another model or rate.
   */
  tokensIn: number;
  tokensOut: number;
  usd: number;
  usdPerMTokIn: number;
  usdPerMTokOut: number;
}

export function costOf(
  tally: GenerateTally,
  minutes: number,
  env: Record<string, string | undefined> = process.env
): RunCost {
  const usdPerMTokIn = Number(env.CRISIS_SIM_USD_PER_MTOK_IN) || 0.3;
  const usdPerMTokOut = Number(env.CRISIS_SIM_USD_PER_MTOK_OUT) || 2.5;
  const tokensIn = Math.round(tally.charsIn / 4);
  const tokensOut = Math.round(tally.charsOut / 4);
  const usd = (tokensIn * usdPerMTokIn + tokensOut * usdPerMTokOut) / 1e6;
  return { minutes, tally, tokensIn, tokensOut, usd, usdPerMTokIn, usdPerMTokOut };
}

const pathRows = (paths: Partial<Record<FiredPath, number>>): string =>
  Object.entries(paths)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([p, n]) => `| ${p} | ${n} |`)
    .join('\n') || '| (none) | 0 |';

export function renderReport(
  s: SimSummary,
  cost: RunCost,
  extra: { commit: string; textOf: (turnId: string) => string | undefined; regressions: string[] }
): string {
  const out: string[] = [];
  out.push(
    `# Crisis full-path simulator: ${s.profile}${s.mutation ? `, mutation ${s.mutation}` : ''}`
  );
  out.push('');
  out.push(`Commit ${extra.commit}; ${s.reps} rep(s); ${s.calls} calls, ${s.turns} scored turns.`);
  out.push('Counts are reads (one turn in one rep) unless they say turns or calls.');
  out.push('');
  out.push('| measure | value |');
  out.push('|---|---|');
  out.push(`| must-catch reads caught | ${pct(s.mustCatch.reads)} |`);
  out.push(
    `| must-catch turns caught every rep | ${s.mustCatch.turnsAlwaysCaught}/${s.mustCatch.turns} |`
  );
  out.push(`| must-not-alarm reads alarmed | ${pct(s.negatives.reads)} |`);
  out.push(
    `| must-not-alarm turns alarmed in any rep | ${s.negatives.turnsEverAlarmed}/${s.negatives.turns} |`
  );
  out.push(`| false-alarm call reads | ${pct(s.falseAlarmCalls)} |`);
  out.push(`| script loops (2+ scripted replies), all calls | ${pct(s.scriptLoops.all)} |`);
  out.push(`| script loops, calls with no must-catch turn | ${pct(s.scriptLoops.negativeCalls)} |`);
  out.push(
    `| carry-over: next turn activates after an activation | ${pct(s.carryOver.afterActivated)} |`
  );
  out.push(`| next turn activates after a quiet turn | ${pct(s.carryOver.afterQuiet)} |`);
  out.push(
    `| activation after an activation, on must-not-alarm turns | ${pct(s.carryOver.intoMustNotAlarm)} |`
  );
  out.push(`| carry-over on calls with no must-catch turn | ${pct(s.carryOver.negativeCalls)} |`);
  out.push(`| crisis line repeated on a call that had one | ${s.repeatedCrisisLine} |`);
  out.push(`| must-not-alarm reads with the follow-up note | ${s.noteOnNegatives} |`);
  out.push(
    `| reads eased to a soft check-in (of them must-catch) | ${s.softChecks.all} (${s.softChecks.mustCatch}) |`
  );
  out.push(`| recall regressions vs baseline | ${extra.regressions.length} |`);
  out.push('');
  out.push('## Paths that fired');
  out.push('');
  out.push('All reads, then false alarms only.');
  out.push('');
  out.push('| path | reads |\n|---|---|');
  out.push(pathRows(s.paths));
  out.push('');
  out.push('| path (false alarms) | reads |\n|---|---|');
  out.push(pathRows(s.falseAlarmPaths));
  out.push('');
  out.push('## By shape (multi-turn corpora) and by set');
  out.push('');
  out.push('| shape or set | must-catch caught | must-not-alarm alarmed |\n|---|---|---|');
  for (const [k, g] of Object.entries({ ...s.byShape }).sort())
    if (!k.startsWith('single-')) out.push(`| ${k} | ${pct(g.caught)} | ${pct(g.alarmed)} |`);
  for (const [k, g] of Object.entries(s.bySet).sort())
    out.push(`| set: ${k} | ${pct(g.caught)} | ${pct(g.alarmed)} |`);
  out.push('');
  out.push('## Must-catch turns missed in some rep');
  out.push('');
  for (const id of s.mustCatch.missed) {
    const [c, n] = s.perTurn[id];
    out.push(`- ${id} caught ${c}/${n}: ${extra.textOf(id) ?? ''}`);
  }
  if (!s.mustCatch.missed.length) out.push('None.');
  if (extra.regressions.length) {
    out.push('');
    out.push('## Recall regressions vs baseline');
    out.push('');
    for (const r of extra.regressions) out.push(`- ${r}`);
  }
  out.push('');
  out.push('## Cost');
  out.push('');
  out.push(
    `${cost.minutes.toFixed(1)} min; ${cost.tally.calls} model calls (${cost.tally.failures} failed after retries, ${cost.tally.empty} empty); ` +
      `about ${cost.tokensIn.toLocaleString('en-US')} tokens in and ${cost.tokensOut.toLocaleString('en-US')} out ` +
      `(4 characters a token), about $${cost.usd.toFixed(2)} at $${cost.usdPerMTokIn}/$${cost.usdPerMTokOut} per million.`
  );
  return out.join('\n') + '\n';
}
