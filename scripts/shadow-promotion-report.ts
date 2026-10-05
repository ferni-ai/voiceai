/**
 * Shadow-to-live promotion report for tool retrieval and the Speech Director.
 *
 * Reads the agent's JSON log lines (files, or stdin) and checks them against
 * the criteria in docs/runbooks/SHADOW-TO-LIVE-PROMOTION.md. Prints counts
 * only; never the user's words.
 *
 *   lk agent logs --config livekit.toml >> /tmp/agent.jsonl   # leave running
 *   pnpm -s tsx scripts/shadow-promotion-report.ts /tmp/agent.jsonl
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { isLiveCovered } from '../src/tools/retrieval/retrieval-stats.js';

export const CRITERIA = {
  retrieval: {
    minCalls: 500,
    minSessions: 50,
    minLiveRecall: 0.98,
    maxPickFailureRate: 0.005,
    /** LIVE_PICK_WAIT_MS: slower picks fall back in live mode. */
    maxPickP95Ms: 150,
  },
  director: { minReplies: 500, maxFailed: 0, maxLatencyP95Us: 5000 },
} as const;

type Line = Record<string, unknown>;

const pct = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

export function report(lines: Line[]): {
  text: string;
  retrievalPass: boolean;
  directorPass: boolean;
} {
  const out: string[] = [];
  const check = (ok: boolean, label: string): boolean => {
    out.push(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    return ok;
  };

  // Tool retrieval: shadow coverage lines are the source of truth for recall;
  // summaries add pick failures and sessions. Older builds log no summary.
  const cov = lines.filter((l) => l.msg === 'TOOL_RETRIEVAL_COVERAGE' && l.mode !== 'live');
  const picks = lines.filter((l) => l.msg === 'TOOL_RETRIEVAL_SHADOW');
  const sums = lines.filter((l) => l.msg === 'TOOL_RETRIEVAL_SUMMARY' && l.mode !== 'live');
  const failures = lines.filter((l) => l.msg === 'tool retrieval failed').length;
  const sessions = new Set(
    [...cov, ...picks, ...sums].map((l) => l.sessionId).filter((s) => typeof s === 'string')
  );
  const k = num(sums[0]?.k) || 20;
  const liveCovered = cov.filter((l) =>
    typeof l.liveCovered === 'boolean'
      ? l.liveCovered
      : isLiveCovered(
          { via: String(l.via), rank: num(l.rank), covered: l.covered === true },
          k,
          'shadow'
        )
  );
  const missed = new Map<string, number>();
  for (const l of cov) {
    if (!liveCovered.includes(l)) missed.set(String(l.tool), (missed.get(String(l.tool)) ?? 0) + 1);
  }
  const embed = picks.map((l) => num(l.embedMs));
  const recall = cov.length ? liveCovered.length / cov.length : 0;
  const failRate = picks.length + failures ? failures / (picks.length + failures) : 0;
  const c = CRITERIA.retrieval;
  out.push(
    `Tool retrieval (shadow): ${sessions.size} sessions, ${picks.length} picks, ${cov.length} tool calls`
  );
  let retrievalPass = check(cov.length >= c.minCalls, `tool calls ${cov.length} >= ${c.minCalls}`);
  retrievalPass =
    check(sessions.size >= c.minSessions, `sessions ${sessions.size} >= ${c.minSessions}`) &&
    retrievalPass;
  retrievalPass =
    check(
      recall >= c.minLiveRecall,
      `live-equivalent recall ${(recall * 100).toFixed(1)}% >= ${c.minLiveRecall * 100}%`
    ) && retrievalPass;
  retrievalPass =
    check(
      failRate <= c.maxPickFailureRate,
      `pick failures ${failures} (${(failRate * 100).toFixed(2)}%) <= ${c.maxPickFailureRate * 100}%`
    ) && retrievalPass;
  const p95 = pct(embed, 0.95);
  retrievalPass =
    check(
      p95 !== null && p95 <= c.maxPickP95Ms,
      `pick latency p95 ${p95 ?? '-'} ms <= ${c.maxPickP95Ms} ms`
    ) && retrievalPass;
  out.push(`  info  pick latency p50 ${pct(embed, 0.5) ?? '-'} ms, max ${pct(embed, 1) ?? '-'} ms`);
  out.push(
    `  info  tools now p50 ${
      pct(
        picks.map((l) => num(l.toolsNow)),
        0.5
      ) ?? '-'
    }, would send p50 ${
      pct(
        picks.map((l) => num(l.toolsWouldSend)),
        0.5
      ) ?? '-'
    }`
  );
  if (missed.size)
    out.push(`  info  missed: ${[...missed].map(([t, n]) => `${t}×${n}`).join(', ')}`);

  // Speech Director: one aggregate line per reply, already text-free.
  const plans = lines.filter((l) => l.msg === 'Speech director plan');
  const failed = plans.filter((l) => l.failed === true).length;
  const lat = plans.map((l) => num(l.latencyUs));
  const modes = new Map<string, number>();
  for (const l of plans) modes.set(String(l.mode), (modes.get(String(l.mode)) ?? 0) + 1);
  const d = CRITERIA.director;
  out.push('');
  out.push(
    `Speech Director: ${plans.length} replies (${[...modes].map(([m, n]) => `${m} ${n}`).join(', ') || 'none'})`
  );
  let directorPass = check(
    plans.length >= d.minReplies,
    `replies ${plans.length} >= ${d.minReplies}`
  );
  directorPass =
    check(failed <= d.maxFailed, `failed replies ${failed} <= ${d.maxFailed}`) && directorPass;
  const lp95 = pct(lat, 0.95);
  directorPass =
    check(
      lp95 !== null && lp95 <= d.maxLatencyP95Us,
      `director CPU p95 ${lp95 ?? '-'} µs <= ${d.maxLatencyP95Us} µs`
    ) && directorPass;
  out.push(
    `  info  held phrases in ${plans.filter((l) => num(l.heldPhrases) > 0).length} replies, cancelled ${plans.filter((l) => l.cancelled === true).length}`
  );
  out.push(
    '  manual  listening A/B (docs/runbooks/SHADOW-TO-LIVE-PROMOTION.md) is not in the logs'
  );
  return { text: out.join('\n'), retrievalPass, directorPass };
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  const streams = files.length ? files.map((f) => createReadStream(f)) : [process.stdin];
  const lines: Line[] = [];
  for (const input of streams) {
    for await (const raw of createInterface({ input })) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') lines.push(parsed as Line);
      } catch {
        // `lk` prints a few non-JSON banner lines.
      }
    }
  }
  console.log(report(lines).text);
}

if (process.argv[1]?.endsWith('shadow-promotion-report.ts')) void main();
