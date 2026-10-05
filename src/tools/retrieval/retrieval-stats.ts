/**
 * Per-session tool retrieval counts, logged once when the session ends
 * (TOOL_RETRIEVAL_SUMMARY), so promotion from shadow to live can be judged
 * from one line per session. Counts and tool names only, never the user's words.
 *
 * `liveCovered` is the conservative recall: a called tool counts only if it
 * was core, sticky, or ranked within the top k of the whole index. Shadow's
 * `retrieved` is judged against the tools the agent had loaded, a subset of
 * the catalog live mode loads, so it overstates what live would have sent.
 *
 * @module tools/retrieval/retrieval-stats
 */

/** Pick latencies kept per session (a long session keeps its first ones). */
const MAX_SAMPLES = 500;

/** See the module note. In live mode the agent holds the whole catalog, so `covered` is exact. */
export function isLiveCovered(
  c: { via: string; rank: number; covered: boolean },
  k: number,
  mode: string
): boolean {
  if (mode === 'live') return c.covered;
  return c.via === 'core' || c.via === 'sticky' || (c.rank >= 0 && c.rank < k);
}

export interface CallCoverage {
  tool: string;
  covered: boolean;
  liveCovered: boolean;
}

export interface RetrievalSummary {
  picks: number;
  pickFailures: number;
  calls: number;
  covered: number;
  liveCovered: number;
  missedTools: string[];
  embedMsP50: number | null;
  embedMsP95: number | null;
  embedMsMax: number | null;
}

export class RetrievalStats {
  private picks = 0;
  private pickFailures = 0;
  private calls = 0;
  private covered = 0;
  private liveCovered = 0;
  private readonly missed = new Set<string>();
  private readonly embedMs: number[] = [];

  /** A pick finished in `ms`, or failed (null). */
  pick(ms: number | null): void {
    if (ms === null) {
      this.pickFailures++;
      return;
    }
    this.picks++;
    if (this.embedMs.length < MAX_SAMPLES) this.embedMs.push(ms);
  }

  call(c: CallCoverage): void {
    this.calls++;
    if (c.covered) this.covered++;
    if (c.liveCovered) this.liveCovered++;
    else this.missed.add(c.tool);
  }

  summary(): RetrievalSummary {
    const ms = [...this.embedMs].sort((a, b) => a - b);
    const at = (p: number): number | null =>
      ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : null;
    return {
      picks: this.picks,
      pickFailures: this.pickFailures,
      calls: this.calls,
      covered: this.covered,
      liveCovered: this.liveCovered,
      missedTools: [...this.missed],
      embedMsP50: at(0.5),
      embedMsP95: at(0.95),
      embedMsMax: ms.length ? ms[ms.length - 1] : null,
    };
  }
}
